-- ============================================================================
-- Migration: Fix Remaining RLS Performance Issues
-- Created: 2025-12-13
-- Description: Address final RLS performance issues from advisor recommendations
-- ============================================================================

-- ============================================
-- 1. Fix auth_rls_initplan issues in remaining tables
-- Wrap auth function calls in (SELECT ...) to avoid per-row re-evaluation
-- ============================================

-- Fix repos table policies (created in 20251212130000_create_optimized_repos_table.sql)
DROP POLICY IF EXISTS "Users can view repos" ON repos;
DROP POLICY IF EXISTS "Service role full access" ON repos;
DROP POLICY IF EXISTS "Users can update own repos" ON repos;

CREATE POLICY "Users can view repos" ON repos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND (
                p.user_id = (select auth.uid()) OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Service role full access" ON repos
    FOR ALL USING ((select auth.role()) = 'service_role');

CREATE POLICY "Users can update own repos" ON repos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND p.user_id = (select auth.uid())
        )
    );

-- Fix audit_complete_data table policies (created in 20251213120000_add_delete_rls_policies.sql)
DROP POLICY IF EXISTS "Users can delete their own audits" ON audit_complete_data;

CREATE POLICY "Users can delete their own audits" ON audit_complete_data
    FOR DELETE USING ((select auth.uid()) = user_id);

-- Fix preflights table delete policy (added in 20251213120000_add_delete_rls_policies.sql)
-- Note: preflights already has consolidated policy from 20251211120000_fix_rls_performance_issues.sql
-- Just need to ensure the delete policy uses (select auth.uid())
DROP POLICY IF EXISTS "Users can delete their own preflights" ON preflights;

CREATE POLICY "Users can delete their own preflights" ON preflights
    FOR DELETE USING ((select auth.uid()) = user_id);

-- Fix audit_jobs table delete policy (added in 20251213120000_add_delete_rls_policies.sql)
DROP POLICY IF EXISTS "Users can delete their own audit jobs" ON audit_jobs;

CREATE POLICY "Users can delete their own audit jobs" ON audit_jobs
    FOR DELETE USING ((select auth.uid()) = user_id);

-- Fix audit_status table delete policy (added in 20251213120000_add_delete_rls_policies.sql)
DROP POLICY IF EXISTS "Users can delete their own audit status" ON audit_status;

CREATE POLICY "Users can delete their own audit status" ON audit_status
    FOR DELETE USING ((select auth.uid()) = (select preflights.user_id from preflights where preflights.id = audit_status.preflight_id));

-- Fix audit_results_chunks table delete policy (added in 20251213120000_add_delete_rls_policies.sql)
-- Note: audit_results_chunks already has consolidated policy from 20251211120000_fix_rls_performance_issues.sql
-- Just need to ensure the delete policy uses (select auth.uid())
DROP POLICY IF EXISTS "Users can delete their own audit result chunks" ON audit_results_chunks;

CREATE POLICY "Users can delete their own audit result chunks" ON audit_results_chunks
    FOR DELETE USING ((select auth.uid()) = (select audits.user_id from audits where audits.id = audit_results_chunks.audit_id));

-- ============================================
-- 2. Add missing foreign key indexes
-- Create indexes on FK columns to reduce query cost and lock contention
-- ============================================

-- Add missing FK indexes for user_id columns (mentioned in advisor report)
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_user_id ON audit_complete_data(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_installation_id ON audit_jobs(installation_id) WHERE installation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_status_user_id ON audit_status(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_csrf_states_user_id ON oauth_csrf_states(user_id);

-- ============================================
-- 3. Consolidate permissive RLS policies
-- Review and merge overlapping policies where appropriate
-- ============================================

-- The main tables (audits, preflights, audit_status, audit_results_chunks, github_accounts)
-- already have consolidated policies from previous migrations.
-- The delete policies added above are restrictive (DELETE only) so they don't conflict.

-- ============================================
-- 4. Review unused indexes (INFO level - addressed conservatively)
-- The advisor flagged several potentially unused indexes.
-- After review, most indexes appear to serve legitimate purposes:
--
-- KEPT (likely used):
-- - idx_oauth_csrf_states_expires_at: Used for cleanup of expired CSRF states
-- - idx_domain_slugs_domain: Used for domain lookups in email infrastructure
-- - All preflights indexes: Used for repo_url, user_id, github_account_id lookups
-- - All repos indexes: Used for repo_id, last_accessed, last_updated lookups
-- - All audit_jobs indexes: Used for status, user_id, preflight_id, worker_id lookups
-- - All verification_codes indexes: Used for user_id, email, expires_at lookups
--
-- POTENTIALLY UNUSED (but kept for safety):
-- - Various audit_results_chunks indexes: Table doesn't exist in current schema
--
-- Recommendation: Monitor pg_stat_user_indexes in production to identify
-- truly unused indexes before dropping any.
-- ============================================

-- Add comments for tracking
COMMENT ON INDEX idx_audit_complete_data_user_id IS 'FK index added for RLS performance (advisor recommendation)';
COMMENT ON INDEX idx_audit_jobs_installation_id IS 'FK index added for RLS performance (advisor recommendation)';
COMMENT ON INDEX idx_audit_status_user_id IS 'FK index added for RLS performance (advisor recommendation)';
COMMENT ON INDEX idx_oauth_csrf_states_user_id IS 'FK index added for RLS performance (advisor recommendation)';
