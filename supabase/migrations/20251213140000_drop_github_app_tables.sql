-- ============================================================================
-- Migration: Drop GitHub App Integration Tables
-- Created: 2025-12-13
-- Description: Remove GitHub App integration tables and related columns
-- ============================================================================

-- ============================================
-- Drop triggers first (conditionally check if tables exist)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE c.relname = 'github_app_installations' AND n.nspname = 'public') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_github_app_installations_updated_at ON public.github_app_installations';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE c.relname = 'github_rate_limits' AND n.nspname = 'public') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_github_rate_limits_updated_at ON public.github_rate_limits';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
             WHERE c.relname = 'github_file_cache' AND n.nspname = 'public') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_github_file_cache_updated_at ON public.github_file_cache';
  END IF;
END;
$$;

-- ============================================
-- Remove GitHub App integration columns from existing tables
-- ============================================

ALTER TABLE public.audit_jobs DROP COLUMN IF EXISTS installation_id;
ALTER TABLE public.preflights DROP COLUMN IF EXISTS installation_id;

ALTER TABLE public.audit_jobs DROP COLUMN IF EXISTS estimated_api_calls;
ALTER TABLE public.audit_jobs DROP COLUMN IF EXISTS actual_api_calls;

-- ============================================
-- Drop GitHub App integration tables
-- ============================================

DROP TABLE IF EXISTS public.github_file_cache;
DROP TABLE IF EXISTS public.github_rate_limits;
DROP TABLE IF EXISTS public.github_app_installations;

-- ============================================
-- Drop associated functions
-- ============================================

DROP FUNCTION IF EXISTS update_github_app_installations_updated_at();
DROP FUNCTION IF EXISTS update_github_rate_limits_updated_at();
DROP FUNCTION IF EXISTS update_github_file_cache_updated_at();
DROP FUNCTION IF EXISTS cleanup_expired_github_file_cache();

-- ============================================
-- Comments
-- ============================================

COMMENT ON DATABASE postgres IS 'Dropped GitHub App integration tables: github_app_installations, github_rate_limits, github_file_cache';
