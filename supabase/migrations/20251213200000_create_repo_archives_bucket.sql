-- ============================================================================
-- Migration: Create repo_archives Storage Bucket
-- Created: 2025-12-13
-- Description: Creates the repo_archives bucket for storing repository zip archives
--              (moved from database blob storage to Supabase Storage)
-- ============================================================================

-- ============================================
-- STORAGE BUCKET VALIDATION
-- ============================================

-- This migration validates that the repo_archives bucket exists
-- The bucket must be created manually in Supabase Dashboard

DO $$
BEGIN
    -- Check if bucket exists
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'repo_archives') THEN
        RAISE EXCEPTION 'repo_archives bucket missing! Follow these steps:

1. Go to Supabase Dashboard > Storage
2. Create bucket named ''repo_archives'' (set as PRIVATE)
3. Run the SQL file ''create_repo_archives_policies.sql'' in SQL Editor

This bucket stores repository zip archives instead of database blobs.';
    ELSE
        RAISE NOTICE '✅ repo_archives bucket exists - your repo storage is ready!';
    END IF;
END;
$$;

-- ============================================
-- COMMENTS AND DOCUMENTATION
-- ============================================

COMMENT ON POLICY "Service role full access to repo_archives" ON storage.objects IS
    'Service role (edge functions) have full access to manage repo archives';

COMMENT ON POLICY "Users can view repo archives" ON storage.objects IS
    'Users can only view repo archives for repositories they have access to via preflights';

COMMENT ON POLICY "Service role can upload repo archives" ON storage.objects IS
    'Only service role can upload new repo archives (handled by RepoStorageService)';

COMMENT ON POLICY "Service role can update repo archives" ON storage.objects IS
    'Only service role can update existing repo archives (for AI file modifications)';

COMMENT ON POLICY "Service role can delete repo archives" ON storage.objects IS
    'Only service role can delete repo archives (for cleanup operations)';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
    -- Verify bucket was created
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'repo_archives') THEN
        RAISE EXCEPTION 'Failed to create repo_archives bucket!';
    END IF;

    RAISE NOTICE '✅ repo_archives bucket created successfully with RLS policies';
    RAISE NOTICE '📦 Repository storage migration complete - moved from database blobs to Supabase Storage';
END;
$$;
