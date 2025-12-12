-- ============================================================================
-- Migration: Drop Legacy Audits Table
-- Created: 2025-12-13
-- Description: Remove the legacy audits table since all functionality has been migrated to audit_complete_data
-- ============================================================================

-- ============================================
-- Verify audit_complete_data has all necessary data
-- ============================================

-- Check that audit_complete_data has data and audit_results_chunks reference it
DO $$
DECLARE
    audit_count INTEGER;
    chunk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO audit_count FROM audit_complete_data;
    SELECT COUNT(*) INTO chunk_count FROM audit_results_chunks;

    RAISE NOTICE 'audit_complete_data has % records', audit_count;
    RAISE NOTICE 'audit_results_chunks has % records', chunk_count;

    IF audit_count = 0 THEN
        RAISE EXCEPTION 'audit_complete_data table is empty! Cannot proceed with dropping audits table.';
    END IF;
END;
$$;

-- ============================================
-- Drop the legacy audits table
-- ============================================

-- Drop any remaining references to audits table in RLS policies
-- (These should have been cleaned up in previous migrations)

-- Drop the audits table
DROP TABLE IF EXISTS public.audits;

-- ============================================
-- Clean up any remaining references and indexes
-- ============================================

-- Drop any indexes that might have been on the audits table
DROP INDEX IF EXISTS idx_audits_user_id;
DROP INDEX IF EXISTS idx_audits_repo_url;
DROP INDEX IF EXISTS idx_audits_created_at;

-- ============================================
-- Comments
-- ============================================

COMMENT ON DATABASE postgres IS 'Dropped legacy audits table - all audit data now stored in audit_complete_data';
