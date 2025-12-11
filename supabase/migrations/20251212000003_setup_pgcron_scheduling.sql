-- ============================================================================
-- Migration: Setup Instant Processing + Fallback Cron
-- Created: 2025-12-12
-- Description: Instant trigger-based processing with cron as fallback only
-- ============================================================================
-- 
-- ARCHITECTURE:
-- 1. Job INSERT → Trigger fires IMMEDIATELY → pg_net calls processor
-- 2. Processor runs instantly (zero wait)
-- 3. Cron only handles: stale jobs, retries, cleanup (fallback)
--
-- This gives instant UX while maintaining reliability.
-- ============================================================================

-- Enable pg_net for HTTP calls from within Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- OPTIONAL INSTANT TRIGGER: Fires on every INSERT to audit_jobs
-- ============================================================================
-- This trigger is OPTIONAL - the audit-job-submit function already triggers
-- processing directly using environment variables. This serves as a backup.
-- The pg_net.http_post is asynchronous, so it doesn't block the INSERT.

CREATE OR REPLACE FUNCTION trigger_instant_job_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_request_id BIGINT;
BEGIN
    -- Get config from database settings
    v_supabase_url := current_setting('app.supabase_url', true);
    v_service_key := current_setting('app.service_role_key', true);
    
    -- If settings are configured, trigger immediate processing
    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        SELECT net.http_post(
            url := v_supabase_url || '/functions/v1/audit-job-processor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || v_service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'trigger', 'instant',
                'job_id', NEW.id,
                'preflight_id', NEW.preflight_id,
                'tier', NEW.tier
            )
        ) INTO v_request_id;
        
        -- Log for debugging (optional)
        RAISE LOG 'Triggered instant processing for job %, request_id: %', NEW.id, v_request_id;
    ELSE
        -- Settings not configured, job will be picked up by cron fallback
        RAISE WARNING 'app.supabase_url or app.service_role_key not configured. Job % will be picked up by cron.', NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never fail the INSERT - job will be picked up by cron fallback
    RAISE WARNING 'Instant trigger failed for job %: %. Will be picked up by cron.', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_instant_processing ON audit_jobs;

-- Create the trigger (fires AFTER INSERT so job is already committed)
CREATE TRIGGER trigger_instant_processing
    AFTER INSERT ON audit_jobs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_instant_job_processing();

COMMENT ON FUNCTION trigger_instant_job_processing IS 'Instantly triggers job processing via pg_net HTTP call on every INSERT';

-- ============================================================================
-- OPTIONAL: Retry trigger for failed jobs that get reset to pending
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_retry_job_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Only trigger on status change TO 'pending' (retry scenario)
    IF OLD.status != 'pending' AND NEW.status = 'pending' THEN
        v_supabase_url := current_setting('app.supabase_url', true);
        v_service_key := current_setting('app.service_role_key', true);
        
        IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/audit-job-processor',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_service_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'trigger', 'retry',
                    'job_id', NEW.id
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_retry_processing ON audit_jobs;

CREATE TRIGGER trigger_retry_processing
    AFTER UPDATE ON audit_jobs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION trigger_retry_job_processing();

-- ============================================================================
-- FALLBACK CRON: Only for stuck jobs and cleanup
-- ============================================================================
-- These run less frequently since instant processing handles most cases

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function that processes any pending jobs (fallback)
CREATE OR REPLACE FUNCTION process_pending_jobs_fallback()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending_count INTEGER;
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Count pending jobs that haven't been picked up
    SELECT COUNT(*) INTO v_pending_count
    FROM audit_jobs
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
      AND attempts < max_attempts
      -- Only process jobs that have been pending for more than 30 seconds
      -- (gives instant trigger time to process)
      AND created_at < NOW() - INTERVAL '30 seconds';
    
    IF v_pending_count > 0 THEN
        v_supabase_url := current_setting('app.supabase_url', true);
        v_service_key := current_setting('app.service_role_key', true);
        
        IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/audit-job-processor',
                headers := jsonb_build_object(
                    'Authorization', 'Bearer ' || v_service_key,
                    'Content-Type', 'application/json'
                ),
                body := jsonb_build_object(
                    'trigger', 'cron_fallback',
                    'batch_size', LEAST(v_pending_count, 5)
                )
            );
        END IF;
    END IF;
    
    RETURN v_pending_count;
END;
$$;

-- Schedule fallback cron jobs (less frequent since instant handles most)

-- Fallback processor: Every 2 minutes (catches any jobs missed by instant trigger)
SELECT cron.schedule(
    'fallback-process-pending-jobs',
    '*/2 * * * *',
    $$SELECT process_pending_jobs_fallback();$$
);

-- Recover stale jobs: Every 5 minutes
SELECT cron.schedule(
    'recover-stale-audit-jobs',
    '*/5 * * * *',
    $$SELECT recover_stale_audit_jobs();$$
);

-- Daily cleanup: 3 AM UTC
SELECT cron.schedule(
    'cleanup-old-audit-jobs',
    '0 3 * * *',
    $$SELECT cleanup_old_audit_jobs(30);$$
);

-- Daily cleanup audit_status: 3:30 AM UTC
SELECT cron.schedule(
    'cleanup-old-audit-status',
    '30 3 * * *',
    $$SELECT cleanup_old_audit_status();$$
);

-- Daily cleanup expired preflights: 4 AM UTC
SELECT cron.schedule(
    'cleanup-expired-preflights',
    '0 4 * * *',
    $$SELECT cleanup_expired_preflights();$$
);

-- ============================================================================
-- CONFIGURATION: Optional database trigger for instant processing
-- ============================================================================
-- NOTE: The audit-job-submit function now triggers processing directly using
-- environment variables (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) from Supabase secrets.
-- This database trigger is OPTIONAL and serves as a backup.
--
-- If you want to enable the database trigger (for redundancy), set these:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://zlrivxntdtewfagrbtry.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';
--
-- Otherwise, instant processing works via the submit function's direct HTTP call.

COMMENT ON FUNCTION process_pending_jobs_fallback IS 'Fallback processor for jobs missed by instant trigger (runs every 2 min)';
COMMENT ON TRIGGER trigger_instant_processing ON audit_jobs IS 'Fires immediately on INSERT, calls processor via pg_net';
