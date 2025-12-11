-- ============================================================================
-- Migration: Setup pg_cron Scheduling
-- Created: 2025-12-12
-- Description: Schedule automated job processing and maintenance
-- ============================================================================

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP calls from within Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- JOB PROCESSING TRIGGER
-- ============================================================================
-- This function will be called by pg_cron to process pending jobs

CREATE OR REPLACE FUNCTION trigger_audit_job_processing()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    pending_count INTEGER;
    request_id BIGINT;
BEGIN
    -- Check if there are pending jobs
    SELECT COUNT(*) INTO pending_count
    FROM audit_jobs
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
      AND attempts < max_attempts;
    
    IF pending_count > 0 THEN
        -- Trigger the job processor via HTTP
        -- This uses pg_net to make an async HTTP call
        SELECT net.http_post(
            url := current_setting('app.supabase_url') || '/functions/v1/audit-job-processor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('trigger', 'pg_cron', 'pending_count', pending_count)
        ) INTO request_id;
        
        RETURN pending_count;
    END IF;
    
    RETURN 0;
END;
$$;

-- ============================================================================
-- PG_CRON SCHEDULES
-- ============================================================================

-- Note: These schedules require pg_cron to be enabled.
-- The cron jobs run in UTC timezone.

-- 1. Process jobs every 10 seconds (for low latency)
-- Note: pg_cron minimum resolution is 1 minute, so we use a workaround
-- We'll rely on pg_notify for immediate processing instead

-- Schedule job processing every minute as a fallback
SELECT cron.schedule(
    'process-audit-jobs-fallback',
    '* * * * *',  -- Every minute
    $$SELECT trigger_audit_job_processing();$$
);

-- 2. Recover stale jobs every 5 minutes
SELECT cron.schedule(
    'recover-stale-audit-jobs',
    '*/5 * * * *',  -- Every 5 minutes
    $$SELECT recover_stale_audit_jobs();$$
);

-- 3. Cleanup old completed jobs daily at 3 AM UTC
SELECT cron.schedule(
    'cleanup-old-audit-jobs',
    '0 3 * * *',  -- 3 AM UTC daily
    $$SELECT cleanup_old_audit_jobs(30);$$
);

-- 4. Cleanup old audit status records daily at 3:30 AM UTC
SELECT cron.schedule(
    'cleanup-old-audit-status',
    '30 3 * * *',  -- 3:30 AM UTC daily
    $$SELECT cleanup_old_audit_status();$$
);

-- 5. Cleanup expired preflights daily at 4 AM UTC
SELECT cron.schedule(
    'cleanup-expired-preflights',
    '0 4 * * *',  -- 4 AM UTC daily
    $$SELECT cleanup_expired_preflights();$$
);

-- ============================================================================
-- IMMEDIATE PROCESSING VIA TRIGGER
-- ============================================================================
-- This trigger fires immediately when a new job is inserted,
-- providing near-instant processing without waiting for pg_cron

CREATE OR REPLACE FUNCTION notify_new_audit_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Notify listeners that a new job is available
    PERFORM pg_notify('new_audit_job', json_build_object(
        'job_id', NEW.id,
        'preflight_id', NEW.preflight_id,
        'tier', NEW.tier,
        'priority', NEW.priority
    )::text);
    
    -- Also trigger immediate processing via pg_net
    PERFORM net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/audit-job-processor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'insert', 'job_id', NEW.id)
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't fail the insert if notification fails
    RAISE WARNING 'Failed to notify new audit job: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_notify_new_audit_job ON audit_jobs;
CREATE TRIGGER trigger_notify_new_audit_job
    AFTER INSERT ON audit_jobs
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_audit_job();

-- ============================================================================
-- CONFIGURATION
-- ============================================================================
-- These settings need to be configured in Supabase Dashboard or via SQL

-- Store URLs as custom settings (these need to be set manually)
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

DO $$
BEGIN
    RAISE NOTICE '
    ==========================================
    PG_CRON SETUP COMPLETE
    ==========================================
    
    Scheduled jobs:
    - process-audit-jobs-fallback: Every minute
    - recover-stale-audit-jobs: Every 5 minutes
    - cleanup-old-audit-jobs: Daily at 3 AM UTC
    - cleanup-old-audit-status: Daily at 3:30 AM UTC
    - cleanup-expired-preflights: Daily at 4 AM UTC
    
    IMPORTANT: You need to set these database settings:
    
    ALTER DATABASE postgres SET app.supabase_url = ''https://your-project.supabase.co'';
    ALTER DATABASE postgres SET app.service_role_key = ''your-service-role-key'';
    
    You can verify schedules with:
    SELECT * FROM cron.job;
    ==========================================
    ';
END;
$$;

COMMENT ON FUNCTION trigger_audit_job_processing IS 'Triggers the audit-job-processor edge function via HTTP';
COMMENT ON FUNCTION notify_new_audit_job IS 'Immediately triggers job processing when a new job is inserted';
