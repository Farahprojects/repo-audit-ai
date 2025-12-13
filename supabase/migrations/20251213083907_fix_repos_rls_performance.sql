-- ============================================================================
-- Fix RLS Performance Issues on repos Table
-- Created: 2025-12-13
--
-- Addresses Supabase linter warnings:
-- 1. Auth RLS Initplan: Replace auth.<function>() with (select auth.<function>())
-- 2. Multiple Permissive Policies: Fix existing policies
-- ============================================================================

-- ============================================
-- FIX EXISTING POLICIES (Update auth function calls)
-- ============================================

-- Fix any existing policies by dropping and recreating them with subqueries
-- This addresses the "auth function re-evaluation" performance issue

DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Loop through all policies on the repos table
    FOR policy_record IN
        SELECT policyname, cmd, qual
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'repos'
    LOOP
        -- Drop and recreate each policy with fixed auth calls
        EXECUTE format('DROP POLICY IF EXISTS %I ON repos', policy_record.policyname);

        -- Recreate with fixed auth function calls
        IF policy_record.cmd = 'ALL' THEN
            EXECUTE format('CREATE POLICY %I ON repos FOR ALL USING ((select auth.role()) = ''service_role'')',
                          policy_record.policyname);
        ELSIF policy_record.cmd = 'SELECT' THEN
            EXECUTE format('CREATE POLICY %I ON repos FOR SELECT USING (
                (select auth.role()) = ''authenticated'' AND
                EXISTS (
                    SELECT 1 FROM preflights p
                    WHERE p.id = repos.repo_id
                    AND (
                        p.user_id = (select auth.uid()) OR
                        (p.user_id IS NULL AND p.is_private = false)
                    )
                )
            )', policy_record.policyname);
        ELSIF policy_record.cmd = 'UPDATE' THEN
            EXECUTE format('CREATE POLICY %I ON repos FOR UPDATE USING (
                (select auth.role()) = ''authenticated'' AND
                EXISTS (
                    SELECT 1 FROM preflights p
                    WHERE p.id = repos.repo_id
                    AND p.user_id = (select auth.uid())
                )
            )', policy_record.policyname);
        END IF;

        RAISE NOTICE 'Fixed policy: %', policy_record.policyname;
    END LOOP;

    RAISE NOTICE '✅ RLS performance optimization complete!';
END;
$$;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    policy_count INTEGER;
    service_role_policies INTEGER;
    user_select_policies INTEGER;
    user_update_policies INTEGER;
BEGIN
    -- Count total policies on repos table
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'repos';

    -- Check for multiple permissive policies (should be minimal now)
    SELECT COUNT(*) INTO service_role_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'repos'
      AND 'service_role' = ANY(roles);

    SELECT COUNT(*) INTO user_select_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'repos'
      AND 'authenticated' = ANY(roles)
      AND cmd = 'SELECT';

    SELECT COUNT(*) INTO user_update_policies
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'repos'
      AND 'authenticated' = ANY(roles)
      AND cmd = 'UPDATE';

    RAISE NOTICE '✅ RLS optimization complete!';
    RAISE NOTICE 'Total policies on repos: %', policy_count;
    RAISE NOTICE 'Service role policies: % (should be 1)', service_role_policies;
    RAISE NOTICE 'User SELECT policies: % (should be 1)', user_select_policies;
    RAISE NOTICE 'User UPDATE policies: % (should be 1)', user_update_policies;

    -- Warn if we still have multiple policies
    IF service_role_policies > 1 THEN
        RAISE WARNING 'Multiple service role policies detected - may cause performance issues';
    END IF;

    IF user_select_policies > 1 THEN
        RAISE WARNING 'Multiple user SELECT policies detected - may cause performance issues';
    END IF;

    IF user_update_policies > 1 THEN
        RAISE WARNING 'Multiple user UPDATE policies detected - may cause performance issues';
    END IF;
END;
$$;
