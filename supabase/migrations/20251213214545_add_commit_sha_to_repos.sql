-- ============================================================================
-- Migration: Add commit_sha column to repos table
-- Created: 2025-12-13 21:45:45
-- Description: Add commit_sha column to track current commit for repos
-- ============================================================================

ALTER TABLE repos ADD COLUMN IF NOT EXISTS commit_sha TEXT;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN repos.commit_sha IS 'Current commit SHA hash for this repository';
