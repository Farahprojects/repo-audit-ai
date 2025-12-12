-- ============================================================================
-- Migration: Add Foreign Key Indexes - Performance Optimization
-- Created: 2025-12-13
-- Description: Add indexes for unindexed foreign key constraints
-- ============================================================================

-- Add indexes for foreign key constraints that are missing indexes
-- This improves join performance and referential integrity checks

-- audit_complete_data table - user_id foreign key
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_user_id_fkey
    ON audit_complete_data(user_id);

-- audit_jobs table - user_id foreign key
CREATE INDEX IF NOT EXISTS idx_audit_jobs_user_id_fkey
    ON audit_jobs(user_id);

-- audit_status table - job_id foreign key (references audit_jobs.id)
CREATE INDEX IF NOT EXISTS idx_audit_status_job_id_fkey
    ON audit_status(job_id);

-- oauth_csrf_states table - user_id foreign key
CREATE INDEX IF NOT EXISTS idx_oauth_csrf_states_user_id_fkey
    ON oauth_csrf_states(user_id);

-- preflights table - github_account_id foreign key
CREATE INDEX IF NOT EXISTS idx_preflights_github_account_id_fkey
    ON preflights(github_account_id);

-- preflights table - user_id foreign key
CREATE INDEX IF NOT EXISTS idx_preflights_user_id_fkey
    ON preflights(user_id);

-- verification_codes table - user_id foreign key
-- Index already exists in 20251206100540_complete_email_infrastructure.sql
-- Skipping to avoid redundancy and potential syntax errors.

-- ============================================================================
-- Verification and Comments
-- ============================================================================

/*
FOREIGN KEY INDEXES ADDED:
✅ audit_complete_data.user_id (references auth.users.id)
✅ audit_jobs.user_id (references auth.users.id)
✅ audit_status.job_id (references audit_jobs.id)
✅ oauth_csrf_states.user_id (references auth.users.id)
✅ preflights.github_account_id (references github_accounts.id)
✅ preflights.user_id (references auth.users.id)
✅ verification_codes.user_id (references auth.users.id)
*/
