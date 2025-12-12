-- ============================================================================
-- Migration: Hardened Trigger & Reset Logic
-- Created: 2025-12-12
-- Description: Hardens the instant trigger with config checks and resets stuck jobs
-- ============================================================================

-- 1. Create a safer function to reset stuck 'pending' jobs
-- This is useful if the previous edge function deploy failed or timed out
CREATE OR REPLACE FUNCTION reset_stuck_audit_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'pending',
        attempts = 0,
        worker_id = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '15 minutes'
      AND attempts < max_attempts;
      
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$;

-- 2. Harden the instant trigger to be purely optional backup
-- We only fire if the config is explicitly set, otherwise we assume the 
-- client/edge-function handled the trigger directly.
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
    -- Get config, treating empty strings as NULL
    v_supabase_url := NULLIF(current_setting('app.supabase_url', true), '');
    v_service_key := NULLIF(current_setting('app.service_role_key', true), '');
    
    -- STRICT CHECK: Only trigger if BOTH settings are present
    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        -- Fire and forget via pg_net
        SELECT extensions.net.http_post(
            url := v_supabase_url || '/functions/v1/audit-job-processor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || v_service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'trigger', 'instant_db_backup',
                'job_id', NEW.id
            )
        ) INTO v_request_id;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Absolutely never fail the INSERT
    RAISE WARNING 'Backup trigger error for job %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Reset any currently stuck jobs from our testing
SELECT reset_stuck_audit_jobs();

-- 4. Log confirmation
DO $$
BEGIN
    RAISE NOTICE 'Trigger hardened and stuck jobs reset.';
END;
$$;
