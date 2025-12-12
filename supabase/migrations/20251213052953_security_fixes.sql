-- ============================================================================
-- Migration: Security Fixes for Database Linter Warnings
-- Created: 2025-12-13
-- Description: Fix function search_path, move extension to dedicated schema
-- ============================================================================

-- ============================================================================
-- FIX 1: Move pg_net extension from public schema to dedicated schema
-- ============================================================================
-- Create a dedicated schema for extensions to avoid security issues

CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net extension to extensions schema
-- First drop if it exists in public, then recreate in extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net SCHEMA extensions;

-- ============================================================================
-- FIX 2: Fix function search_path security for cleanup_expired_file_cache
-- ============================================================================
-- Add SET search_path to prevent privilege escalation

CREATE OR REPLACE FUNCTION cleanup_expired_file_cache() RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM github_file_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- UPDATE: Functions that use pg_net need to reference the new schema
-- ============================================================================

-- Update trigger_instant_job_processing to use extensions.net
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

-- Update trigger_retry_job_processing to use extensions.net
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

-- Update process_pending_jobs_fallback to use extensions.net
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
