-- Fix RLS Performance Issues: auth_rls_initplan and multiple_permissive_policies
-- This migration addresses database linter warnings for optimal query performance

-- ============================================
-- 1. Fix auth_rls_initplan issues
-- Wrap auth function calls in (select ...) to avoid re-evaluation
-- ============================================

-- Fix profiles table policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can delete their own profile" ON public.profiles
  FOR DELETE USING ((select auth.uid()) = id);

-- Fix audits table policies
DROP POLICY IF EXISTS "Users can view their own audits" ON public.audits;
DROP POLICY IF EXISTS "Users can create their own audits" ON public.audits;

CREATE POLICY "Users can view their own audits" ON public.audits
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own audits" ON public.audits
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Fix github_accounts table policies
DROP POLICY IF EXISTS "Users can view own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can insert own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can update own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can delete own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Service role can manage github_accounts" ON github_accounts;

-- Consolidated policy: Service role can do everything, users can only access their own
CREATE POLICY "github_accounts_access_policy" ON github_accounts
  FOR ALL USING (
    (select auth.role()) = 'service_role' OR
    (select auth.uid()) = user_id
  );

-- Fix preflights table policies
DROP POLICY IF EXISTS "Users can view own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can insert own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can update own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can delete own preflights" ON preflights;
DROP POLICY IF EXISTS "Service role can manage preflights" ON preflights;

-- Consolidated policy: Service role can do everything, users can access their own
CREATE POLICY "preflights_access_policy" ON preflights
  FOR ALL USING (
    (select auth.role()) = 'service_role' OR
    (select auth.uid()) = user_id OR
    (user_id IS NULL AND is_private = false)
  );

-- Fix audit_status table policies
DROP POLICY IF EXISTS "Users can view their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Users can insert their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Users can update their own audit status" ON audit_status;
DROP POLICY IF EXISTS "Service role can manage all audit status" ON audit_status;

-- Consolidated policy: Service role can do everything, users can access their own
CREATE POLICY "audit_status_access_policy" ON audit_status
  FOR ALL USING (
    (select auth.role()) = 'service_role' OR
    (select auth.uid()) = user_id
  );

-- Fix legal table policies
DROP POLICY IF EXISTS "Legal documents are publicly readable" ON legal;
DROP POLICY IF EXISTS "Service role can manage legal documents" ON legal;

-- Policy for public read access (SELECT only)
CREATE POLICY "legal_public_read" ON legal
  FOR SELECT USING (true);

-- Policy for service role management (all operations)
CREATE POLICY "legal_service_manage" ON legal
  FOR ALL USING ((select auth.role()) = 'service_role');

-- Fix oauth_csrf_states policy
DROP POLICY IF EXISTS "Service role can manage oauth_csrf_states" ON oauth_csrf_states;

CREATE POLICY "Service role can manage oauth_csrf_states" ON oauth_csrf_states
  FOR ALL USING ((select auth.role()) = 'service_role');

-- Fix email infrastructure tables (auth_rls_initplan)
DROP POLICY IF EXISTS "Allow service role full access" ON public.email_messages;
DROP POLICY IF EXISTS "Allow service role full access" ON public.domain_slugs;
DROP POLICY IF EXISTS "Allow service role full access" ON public.email_notification_templates;

CREATE POLICY "Allow service role full access" ON public.email_messages
  FOR ALL USING ((select auth.role()) = 'service_role');

CREATE POLICY "Allow service role full access" ON public.domain_slugs
  FOR ALL USING ((select auth.role()) = 'service_role');

CREATE POLICY "Allow service role full access" ON public.email_notification_templates
  FOR ALL USING ((select auth.role()) = 'service_role');

-- Fix legal table multiple permissive policies
DROP POLICY IF EXISTS "legal_public_read" ON legal;
DROP POLICY IF EXISTS "legal_service_manage" ON legal;

-- Public read access for legal documents
CREATE POLICY "legal_public_read" ON legal
  FOR SELECT USING (true);

-- Service role can manage legal documents (separate policies)
CREATE POLICY "legal_service_insert" ON legal
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "legal_service_update" ON legal
  FOR UPDATE USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "legal_service_delete" ON legal
  FOR DELETE USING ((select auth.role()) = 'service_role');

-- Fix verification_codes policies (now that table exists)
DROP POLICY IF EXISTS "Users can view their own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can create their own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can delete their own verification codes" ON public.verification_codes;

CREATE POLICY "Users can view their own verification codes" ON public.verification_codes
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own verification codes" ON public.verification_codes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own verification codes" ON public.verification_codes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- 2. Fix multiple_permissive_policies issues
-- The consolidation above already addresses most of these
-- by combining overlapping policies into single consolidated ones
-- ============================================

-- Fix audit_results_chunks table policies (auth_rls_initplan + multiple_permissive_policies)
DROP POLICY IF EXISTS "Users can view their own audit result chunks" ON audit_results_chunks;
DROP POLICY IF EXISTS "Service role can manage all audit result chunks" ON audit_results_chunks;

-- Consolidated policy: Users can view their own chunks, service role can manage all
CREATE POLICY "audit_results_chunks_access_policy" ON audit_results_chunks
  FOR ALL USING (
    (select auth.role()) = 'service_role' OR
    (select auth.uid()) = (select audits.user_id from audits where audits.id = audit_results_chunks.audit_id)
  );
