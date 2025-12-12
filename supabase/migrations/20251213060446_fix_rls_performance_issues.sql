-- ============================================================================
-- Migration: Fix RLS Performance Issues
-- Created: 2025-12-13
-- Description: Fix auth RLS init plan and consolidate multiple permissive policies
-- ============================================================================

-- ============================================================================
-- FIX 1: Auth RLS Initialization Plan Issues
-- ============================================================================
-- Replace direct auth function calls with subqueries to prevent re-evaluation per row

-- Fix audit_jobs table policies
DROP POLICY IF EXISTS "Users can view their own jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Service role can manage all jobs" ON audit_jobs;

-- Recreate with optimized auth function calls
CREATE POLICY "Users can view their own jobs" ON audit_jobs
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own jobs" ON audit_jobs
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own jobs" ON audit_jobs
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own audit jobs" ON audit_jobs
    FOR DELETE USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role can manage all jobs" ON audit_jobs
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- FIX 2: Consolidate Multiple Permissive Policies
-- ============================================================================
-- Remove redundant policies and consolidate into single optimized policies

-- Fix repos table - consolidate multiple policies
DROP POLICY IF EXISTS "Users can view repos" ON repos;
DROP POLICY IF EXISTS "Service role full access" ON repos;
DROP POLICY IF EXISTS "Users can update own repos" ON repos;

-- Consolidated repos policy (covers SELECT, UPDATE for authenticated users and service role)
CREATE POLICY "repos_access_policy" ON repos
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

-- Fix audit_status table - consolidate policies
DROP POLICY IF EXISTS "Users can view their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Users can insert their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Users can update their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Service role can manage all audit status" ON audit_status;
DROP POLICY IF EXISTS "Users can delete their own audit status" ON audit_status;
DROP POLICY IF EXISTS "audit_status_access_policy" ON audit_status;

-- Consolidated audit_status policy
CREATE POLICY "audit_status_access_policy" ON audit_status
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

-- Fix preflights table - consolidate policies
DROP POLICY IF EXISTS "Users can view own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can insert own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can update own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can delete own preflights" ON preflights;
DROP POLICY IF EXISTS "Service role can manage preflights" ON preflights;
DROP POLICY IF EXISTS "Users can delete their own preflights" ON preflights;
DROP POLICY IF EXISTS "preflights_access_policy" ON preflights;

-- Consolidated preflights policy
CREATE POLICY "preflights_access_policy" ON preflights
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

-- ============================================================================
-- FIX 3: Ensure All Auth Function Calls Use Subqueries
-- ============================================================================
-- Update any remaining policies that might have been missed

-- Ensure github_accounts policies use optimized auth calls
DROP POLICY IF EXISTS "Users can view own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can insert own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can update own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Service role can manage github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "github_accounts_access_policy" ON github_accounts;

CREATE POLICY "github_accounts_access_policy" ON github_accounts
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

-- Ensure profiles policies use optimized auth calls
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

CREATE POLICY "profiles_access_policy" ON public.profiles
    FOR ALL USING ((select auth.uid()) = id);

-- Ensure audits policies use optimized auth calls
DROP POLICY IF EXISTS "Users can view their own audits" ON public.audits;
DROP POLICY IF EXISTS "Users can create their own audits" ON public.audits;

CREATE POLICY "audits_access_policy" ON public.audits
    FOR ALL USING ((select auth.uid()) = user_id);

-- ============================================================================
-- VERIFICATION: Check for any remaining unoptimized policies
-- ============================================================================

DO $$
DECLARE
    policy_record RECORD;
    problematic_policies TEXT := '';
BEGIN
    -- Find policies that still use auth functions directly
    FOR policy_record IN
        SELECT
            schemaname,
            tablename,
            policyname,
            cmd,
            roles,
            qual
        FROM pg_policies
        WHERE qual LIKE '%auth.%('
          AND qual NOT LIKE '%(select auth.%'
    LOOP
        problematic_policies := problematic_policies || format(
            'Table: %I.%I, Policy: %I, Qual: %s' || E'\n',
            policy_record.schemaname,
            policy_record.tablename,
            policy_record.policyname,
            policy_record.qual
        );
    END LOOP;

    IF problematic_policies != '' THEN
        RAISE WARNING 'Found policies that may still have auth RLS init plan issues: %', problematic_policies;
    ELSE
        RAISE NOTICE 'All RLS policies have been optimized for auth function calls.';
    END IF;
END $$;
