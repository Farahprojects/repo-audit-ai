-- ============================================================================
-- MIGRATION: Consolidate Missing Schema Changes
-- Created: 2025-12-14 20:00:00
-- Description: Add missing columns and indexes that were in removed migrations
-- All changes are idempotent using IF NOT EXISTS patterns
-- ============================================================================

-- Add commit_sha column to repos table (from removed migration 20251213214545)
ALTER TABLE repos ADD COLUMN IF NOT EXISTS commit_sha TEXT;
COMMENT ON COLUMN repos.commit_sha IS 'Current commit SHA hash for this repository';

-- Add installation_id column to preflights table (from removed migration 20251214000000)
ALTER TABLE preflights ADD COLUMN IF NOT EXISTS installation_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_preflights_installation ON preflights(repo_url, installation_id);

-- ============================================================================
-- VERIFICATION QUERIES (uncomment to verify changes)
-- ============================================================================

-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'repos' AND column_name = 'commit_sha';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'preflights' AND column_name = 'installation_id';
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'preflights' AND indexname = 'idx_preflights_installation';