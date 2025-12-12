-- ============================================================================
-- Migration: Fix Function Ownership and Permissions
-- Created: 2025-12-13
-- Description: Change function owner and revoke public execute permissions
-- ============================================================================

-- Create dedicated role for maintenance functions
CREATE ROLE safe_function_owner NOLOGIN;
GRANT safe_function_owner TO postgres;

-- Change function ownership from postgres to safer role
ALTER FUNCTION public.cleanup_expired_file_cache() OWNER TO safe_function_owner;

-- Revoke execute permissions from public roles
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_file_cache() FROM public;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_file_cache() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_file_cache() FROM authenticated;
