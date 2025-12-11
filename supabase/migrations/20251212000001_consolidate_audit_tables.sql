-- ============================================================================
-- Migration: Consolidate Audit Tables
-- Created: 2025-12-12
-- Description: Add columns to audit_status, create unified views
-- ============================================================================

-- 1. Add foreign key from audit_status to audit_jobs
ALTER TABLE audit_status 
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES audit_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_status_job_id ON audit_status(job_id);

-- 2. Add missing columns to audit_status for richer tracking
ALTER TABLE audit_status 
ADD COLUMN IF NOT EXISTS worker_progress JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS plan_data JSONB,
ADD COLUMN IF NOT EXISTS token_usage JSONB DEFAULT '{"planner": 0, "workers": 0, "coordinator": 0}'::jsonb;

COMMENT ON COLUMN audit_status.worker_progress IS 'Array of {workerId, status, progress, startedAt, completedAt}';
COMMENT ON COLUMN audit_status.plan_data IS 'Cached planner output for debugging';
COMMENT ON COLUMN audit_status.token_usage IS 'Token usage breakdown by phase';

-- 3. Create view for unified audit history
CREATE OR REPLACE VIEW audit_history AS
SELECT 
    a.id,
    a.user_id,
    a.repo_url,
    a.tier,
    a.health_score,
    a.summary,
    a.issues,
    a.created_at,
    a.total_tokens,
    a.extra_data,
    p.owner,
    p.repo,
    p.stats,
    p.fingerprint,
    aj.status AS job_status,
    aj.attempts AS job_attempts,
    aj.last_error AS job_last_error,
    ast.progress AS current_progress,
    ast.logs AS progress_logs
FROM audits a
LEFT JOIN preflights p ON a.repo_url = p.repo_url AND a.user_id = p.user_id
LEFT JOIN audit_jobs aj ON aj.preflight_id = p.id
LEFT JOIN audit_status ast ON ast.preflight_id = p.id
ORDER BY a.created_at DESC;

COMMENT ON VIEW audit_history IS 'Unified view of audit history with job and status details';

-- 4. Function to get user's pending/active audits
CREATE OR REPLACE FUNCTION get_user_active_audits(p_user_id UUID)
RETURNS TABLE(
    preflight_id UUID,
    repo_url TEXT,
    tier TEXT,
    status TEXT,
    progress INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        aj.preflight_id,
        p.repo_url,
        aj.tier,
        aj.status,
        COALESCE(ast.progress, 0) AS progress,
        aj.created_at
    FROM audit_jobs aj
    JOIN preflights p ON p.id = aj.preflight_id
    LEFT JOIN audit_status ast ON ast.preflight_id = aj.preflight_id
    WHERE aj.user_id = p_user_id
      AND aj.status IN ('pending', 'processing')
    ORDER BY aj.created_at DESC;
$$;

-- 5. Function to cancel a pending audit job
CREATE OR REPLACE FUNCTION cancel_audit_job(p_job_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'cancelled',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id
      AND user_id = p_user_id
      AND status IN ('pending', 'processing');
    
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    
    IF v_row_count > 0 THEN
        UPDATE audit_status
        SET 
            status = 'cancelled',
            updated_at = NOW()
        WHERE job_id = p_job_id;
    END IF;
    
    RETURN v_row_count > 0;
END;
$$;

COMMENT ON FUNCTION get_user_active_audits IS 'Get all active (pending/processing) audits for a user';
COMMENT ON FUNCTION cancel_audit_job IS 'Cancel a pending or processing job (user must own the job)';
