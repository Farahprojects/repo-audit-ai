-- Optimize database indexes: Add missing indexes and remove unused ones
-- This addresses unindexed_foreign_keys and unused_index linter warnings

-- ============================================
-- 1. Add missing index for unindexed foreign key
-- ============================================

-- Add index on audits.user_id to support the foreign key constraint
CREATE INDEX IF NOT EXISTS idx_audits_user_id ON public.audits(user_id);

-- ============================================
-- 2. Remove unused indexes (carefully selected)
-- ============================================

-- Remove unused indexes from tables that haven't been used yet
-- These indexes were created but never queried

-- oauth_csrf_states: Remove unused user_id index
DROP INDEX IF EXISTS idx_oauth_csrf_states_user_id;

-- email_messages: Remove unused indexes (table likely not heavily used yet)
DROP INDEX IF EXISTS idx_email_messages_from_email;
DROP INDEX IF EXISTS idx_email_messages_to_email;
DROP INDEX IF EXISTS idx_email_messages_direction;
DROP INDEX IF EXISTS idx_email_messages_created_at;

-- github_accounts: Remove unused github_user_id index
DROP INDEX IF EXISTS idx_github_accounts_github_user_id;

-- verification_codes: Keep user_id and expires_at (useful for cleanup), remove others
DROP INDEX IF EXISTS idx_verification_codes_email;

-- audit_status: Remove unused indexes (keep status and updated_at as they might be useful)
DROP INDEX IF EXISTS idx_audit_status_user_id;
DROP INDEX IF EXISTS idx_audit_status_preflight_id;
DROP INDEX IF EXISTS idx_audit_status_created_at;

-- preflights: Remove unused indexes (keep repo_url and user_id as they might be useful for queries)
DROP INDEX IF EXISTS idx_preflights_expires_at;

-- ============================================
-- 3. Keep useful indexes on audit_results_chunks
-- ============================================

-- The audit_results_chunks indexes are new and might be used in the future
-- Keep them for now as they support the chunking functionality
-- idx_audit_results_chunks_audit_id (foreign key support)
-- idx_audit_results_chunks_type (query optimization)
-- idx_audit_results_chunks_created_at (temporal queries)
-- idx_audit_results_chunks_size (size-based queries)
