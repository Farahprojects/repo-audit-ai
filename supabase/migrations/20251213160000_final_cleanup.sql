-- ============================================================================
-- Migration: Final Cleanup of Legacy Tables and Columns
-- Created: 2025-12-13
-- Description: Ensures all legacy storage columns and tables are removed.
-- ============================================================================

-- 1. Cleaning 'repos' table
-- We moved to storage_path, so archive_blob and uncompressed_size must go.
-- They might have been removed already, but we use IF EXISTS to be safe/idempotent.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'repos' AND column_name = 'archive_blob') THEN
        ALTER TABLE repos DROP COLUMN archive_blob;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'repos' AND column_name = 'compressed_content') THEN
        ALTER TABLE repos DROP COLUMN compressed_content;
    END IF;

    -- Ensure storage_path exists (sanity check)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'repos' AND column_name = 'storage_path') THEN
        RAISE EXCEPTION 'Critical: storage_path column missing in repos table!';
    END IF;
END;
$$;

-- 2. Drop any confirmed legacy tables if they persist
-- (none identified beyond reasoning_*, which are already dropped)

-- 3. Optimization: Vacuum analyze to reclaim space from dropped blobs
-- VACUUM FULL analysis; -- Cannot run VACUUM inside a transaction block in standard migrations usually, omitting.

-- 4. Log
DO $$
BEGIN
    RAISE NOTICE 'Final cleanup complete. Repo storage is strictly using Supabase Object Storage via storage_path.';
END;
$$;
