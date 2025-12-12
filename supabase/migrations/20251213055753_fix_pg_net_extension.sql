-- ============================================================================
-- Migration: Properly Fix pg_net Extension Schema
-- Created: 2025-12-13
-- Description: Move pg_net extension from public to extensions schema
-- ============================================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Safely move pg_net extension to extensions schema
-- Use ALTER EXTENSION which is safer than DROP/CREATE
DO $$
BEGIN
    -- Check if pg_net is in public schema
    IF EXISTS (
        SELECT 1 FROM pg_extension e
        JOIN pg_namespace n ON e.extnamespace = n.oid
        WHERE e.extname = 'pg_net' AND n.nspname = 'public'
    ) THEN
        -- Move extension to extensions schema
        ALTER EXTENSION pg_net SET SCHEMA extensions;
        RAISE NOTICE 'Moved pg_net extension from public to extensions schema';
    ELSIF EXISTS (
        SELECT 1 FROM pg_extension e
        JOIN pg_namespace n ON e.extnamespace = n.oid
        WHERE e.extname = 'pg_net' AND n.nspname = 'extensions'
    ) THEN
        RAISE NOTICE 'pg_net extension is already in extensions schema';
    ELSE
        -- Extension doesn't exist, create it in extensions schema
        CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
        RAISE NOTICE 'Created pg_net extension in extensions schema';
    END IF;
END $$;

-- Update all functions that reference net. to use extensions.net.
-- This ensures compatibility after the schema move

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
        SELECT extensions.net.http_post(
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
            PERFORM extensions.net.http_post(
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
            PERFORM extensions.net.http_post(
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
