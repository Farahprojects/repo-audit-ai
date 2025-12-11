-- ============================================================================
-- Migration: Create Audit Jobs Queue
-- Created: 2025-12-12
-- Description: Queue-based audit processing for fire-and-forget architecture
-- ============================================================================

-- ============================================================================
-- AUDIT JOBS QUEUE TABLE
-- ============================================================================
-- This is the job queue for audit processing.
-- Jobs are inserted by audit-job-submit and processed by audit-job-processor.

CREATE TABLE IF NOT EXISTS audit_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Job identification
    preflight_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    
    -- Job state machine
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    
    -- Processing metadata
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Worker assignment (for distributed processing)
    worker_id TEXT,
    locked_until TIMESTAMPTZ,
    
    -- Error tracking
    last_error TEXT,
    error_stack TEXT,
    
    -- Input/Output
    input_data JSONB DEFAULT '{}'::jsonb,
    output_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(preflight_id) -- Only one job per preflight
);

-- Indexes for efficient queue operations
CREATE INDEX IF NOT EXISTS idx_audit_jobs_status_priority 
    ON audit_jobs(status, priority DESC, scheduled_at ASC) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_audit_jobs_user_id ON audit_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_preflight_id ON audit_jobs(preflight_id);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_worker_id ON audit_jobs(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_jobs_locked_until ON audit_jobs(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_jobs_created_at ON audit_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own jobs" ON audit_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs" ON audit_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all jobs" ON audit_jobs
    FOR ALL USING (auth.role() = 'service_role');

-- Auto-update timestamp trigger (reuse existing function if available)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_audit_jobs_updated_at'
    ) THEN
        CREATE TRIGGER trigger_audit_jobs_updated_at
            BEFORE UPDATE ON audit_jobs
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
EXCEPTION
    WHEN undefined_function THEN
        -- Create the function if it doesn't exist
        CREATE OR REPLACE FUNCTION update_audit_jobs_updated_at()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        CREATE TRIGGER trigger_audit_jobs_updated_at
            BEFORE UPDATE ON audit_jobs
            FOR EACH ROW
            EXECUTE FUNCTION update_audit_jobs_updated_at();
END;
$$;

-- ============================================================================
-- JOB ACQUISITION FUNCTION (Atomic Lock)
-- ============================================================================
-- This function atomically acquires a job for processing.
-- It prevents race conditions when multiple workers try to claim the same job.

CREATE OR REPLACE FUNCTION acquire_audit_job(
    p_worker_id TEXT, 
    p_lock_duration INTERVAL DEFAULT '5 minutes'
)
RETURNS TABLE(
    job_id UUID,
    preflight_id UUID,
    user_id UUID,
    tier TEXT,
    input_data JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        UPDATE audit_jobs
        SET 
            status = 'processing',
            worker_id = p_worker_id,
            locked_until = NOW() + p_lock_duration,
            started_at = COALESCE(started_at, NOW()),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = (
            SELECT aj.id
            FROM audit_jobs aj
            WHERE aj.status = 'pending'
              AND aj.scheduled_at <= NOW()
              AND aj.attempts < aj.max_attempts
            ORDER BY aj.priority DESC, aj.scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING audit_jobs.id, audit_jobs.preflight_id, audit_jobs.user_id, audit_jobs.tier, audit_jobs.input_data
    )
    SELECT * FROM claimed;
END;
$$;

-- ============================================================================
-- BATCH JOB ACQUISITION (for high throughput)
-- ============================================================================
-- Acquires multiple jobs at once for batch processing

CREATE OR REPLACE FUNCTION acquire_audit_jobs_batch(
    p_worker_id TEXT, 
    p_batch_size INTEGER DEFAULT 5,
    p_lock_duration INTERVAL DEFAULT '10 minutes'
)
RETURNS TABLE(
    job_id UUID,
    preflight_id UUID,
    user_id UUID,
    tier TEXT,
    input_data JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        UPDATE audit_jobs
        SET 
            status = 'processing',
            worker_id = p_worker_id,
            locked_until = NOW() + p_lock_duration,
            started_at = COALESCE(started_at, NOW()),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id IN (
            SELECT aj.id
            FROM audit_jobs aj
            WHERE aj.status = 'pending'
              AND aj.scheduled_at <= NOW()
              AND aj.attempts < aj.max_attempts
            ORDER BY aj.priority DESC, aj.scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT p_batch_size
        )
        RETURNING audit_jobs.id, audit_jobs.preflight_id, audit_jobs.user_id, audit_jobs.tier, audit_jobs.input_data
    )
    SELECT * FROM claimed;
END;
$$;

-- ============================================================================
-- JOB COMPLETION FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_audit_job(
    p_job_id UUID,
    p_output_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'completed',
        output_data = p_output_data,
        completed_at = NOW(),
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION fail_audit_job(
    p_job_id UUID,
    p_error TEXT,
    p_error_stack TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts INTEGER;
    v_max_attempts INTEGER;
BEGIN
    SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
    FROM audit_jobs WHERE id = p_job_id;
    
    IF v_attempts >= v_max_attempts THEN
        -- Final failure
        UPDATE audit_jobs
        SET 
            status = 'failed',
            last_error = p_error,
            error_stack = p_error_stack,
            completed_at = NOW(),
            locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_job_id;
    ELSE
        -- Retry: reset to pending with exponential backoff
        UPDATE audit_jobs
        SET 
            status = 'pending',
            last_error = p_error,
            error_stack = p_error_stack,
            scheduled_at = NOW() + (POWER(2, v_attempts) || ' minutes')::INTERVAL,
            locked_until = NULL,
            worker_id = NULL,
            updated_at = NOW()
        WHERE id = p_job_id;
    END IF;
END;
$$;

-- ============================================================================
-- STALE JOB RECOVERY
-- ============================================================================
-- Recovers jobs that were locked but never completed (worker crashed)

CREATE OR REPLACE FUNCTION recover_stale_audit_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    recovered_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'pending',
        worker_id = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE status = 'processing'
      AND locked_until < NOW();
    
    GET DIAGNOSTICS recovered_count = ROW_COUNT;
    RETURN recovered_count;
END;
$$;

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_audit_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < NOW() - (days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================================================
-- QUEUE STATS FUNCTION (for monitoring)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_audit_queue_stats()
RETURNS TABLE(
    pending_count BIGINT,
    processing_count BIGINT,
    completed_today BIGINT,
    failed_today BIGINT,
    avg_processing_seconds NUMERIC,
    oldest_pending_minutes NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) AS completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= CURRENT_DATE) AS failed_today,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) AS avg_processing_seconds,
        MAX(EXTRACT(EPOCH FROM (NOW() - scheduled_at)) / 60) FILTER (WHERE status = 'pending') AS oldest_pending_minutes
    FROM audit_jobs;
$$;

-- Enable realtime for job status updates
ALTER PUBLICATION supabase_realtime ADD TABLE audit_jobs;

-- Comments
COMMENT ON TABLE audit_jobs IS 'Queue for audit job processing. Workers claim jobs atomically using acquire_audit_job().';
COMMENT ON FUNCTION acquire_audit_job IS 'Atomically claim a pending job for processing. Returns NULL if no jobs available.';
COMMENT ON FUNCTION acquire_audit_jobs_batch IS 'Atomically claim multiple pending jobs for batch processing.';
COMMENT ON FUNCTION complete_audit_job IS 'Mark a job as completed with output data.';
COMMENT ON FUNCTION fail_audit_job IS 'Mark a job as failed. Will retry if under max_attempts.';
COMMENT ON FUNCTION recover_stale_audit_jobs IS 'Recover jobs that were locked but never completed (worker crashed).';
COMMENT ON FUNCTION get_audit_queue_stats IS 'Get current queue statistics for monitoring.';
