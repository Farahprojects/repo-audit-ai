-- ============================================================================
-- Verification SQL: Check repo_archives bucket and policies setup
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================================

-- ============================================
-- 1. CHECK IF BUCKET EXISTS
-- ============================================

SELECT
    id as bucket_id,
    name as bucket_name,
    public as is_public,
    created_at
FROM storage.buckets
WHERE id = 'repo_archives';

-- ============================================
-- 2. CHECK STORAGE POLICIES
-- ============================================

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as allowed_operations,
    qual as policy_condition,
    with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%repo_archives%'
ORDER BY policyname;

-- ============================================
-- 3. CHECK REPOS TABLE STRUCTURE
-- ============================================

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'repos'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- 4. CHECK REPOS TABLE POLICIES
-- ============================================

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as allowed_operations,
    qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'repos'
ORDER BY policyname;

-- ============================================
-- 5. CHECK RECENT REPOS ENTRIES (if any)
-- ============================================

SELECT
    id,
    repo_id,
    repo_name,
    branch,
    storage_path,
    archive_hash,
    archive_size,
    created_at,
    last_updated,
    last_accessed
FROM repos
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- 6. CHECK PREFLIGHTS TABLE (linked to repos)
-- ============================================

SELECT
    id,
    user_id,
    repo_url,
    owner,
    repo,
    is_private,
    created_at
FROM preflights
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- EXPECTED RESULTS:
-- ============================================

/*
1. Bucket Check:
   - Should return 1 row with id='repo_archives', public=false

2. Storage Policies:
   - Should return 3 policies:
     * "Service role full access to repo_archives"
     * "Users can manage own repo archives"
     * "Service role manage repo archives"

3. Repos Table:
   - Should have columns: id, repo_id, repo_name, branch, storage_path,
     archive_hash, archive_size, file_index, created_at, last_updated, last_accessed

4. Repos Policies:
   - Should have RLS policies for repos table access control

5. Recent Entries:
   - May be empty if no repos processed yet

If everything looks good, your repo storage system is ready!
*/
