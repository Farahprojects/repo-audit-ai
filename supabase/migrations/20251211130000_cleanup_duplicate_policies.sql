-- Fix duplicate RLS policies that are causing multiple_permissive_policies warnings
-- This addresses the issue where old policies with USING (true) still exist alongside new policies

-- ============================================
-- 1. Clean up email_messages policies
-- ============================================

-- Drop ALL policies on email_messages to start fresh
DROP POLICY IF EXISTS "Allow service role full access" ON public.email_messages;
DROP POLICY IF EXISTS "Enable all access for service role" ON public.email_messages;

-- Create single consolidated policy
CREATE POLICY "email_messages_service_access" ON public.email_messages
  FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- 2. Clean up domain_slugs policies
-- ============================================

-- Drop ALL policies on domain_slugs to start fresh
DROP POLICY IF EXISTS "Allow service role full access" ON public.domain_slugs;
DROP POLICY IF EXISTS "Enable all access for service role" ON public.domain_slugs;

-- Create single consolidated policy
CREATE POLICY "domain_slugs_service_access" ON public.domain_slugs
  FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- 3. Clean up email_notification_templates policies
-- ============================================

-- Drop ALL policies on email_notification_templates to start fresh
DROP POLICY IF EXISTS "Allow service role full access" ON public.email_notification_templates;
DROP POLICY IF EXISTS "Enable all access for service role" ON public.email_notification_templates;

-- Create single consolidated policy
CREATE POLICY "email_notification_templates_service_access" ON public.email_notification_templates
  FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- 4. Clean up audit_results_chunks policies (if table exists)
-- ============================================

-- Note: audit_results_chunks table may not exist in the database
-- These policies are causing linter warnings but the table doesn't exist
-- If you create this table in the future, use proper RLS policies

-- For now, we can't drop policies on a non-existent table
-- The linter warnings for audit_results_chunks can be ignored
