-- ============================================================================
-- FIX: Drop and Recreate repo_archives Storage Policies
-- Run this in Supabase Dashboard > SQL Editor
--
-- WARNING: This may fail due to permission restrictions.
-- If it fails, you MUST recreate policies through Dashboard UI instead.
-- ============================================================================

-- ============================================
-- DROP EXISTING BROKEN POLICIES (ROBUST METHOD)
-- ============================================

-- This approach dynamically finds and drops all repo_archives policies,
-- regardless of Supabase-generated hash suffixes. This is much more robust
-- than hardcoding specific policy names that may change.

DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Find all policies on storage.objects that relate to repo_archives
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE '%repo_archives%'
    LOOP
        -- Drop each policy dynamically
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- ============================================
-- CREATE CORRECT POLICIES
-- ============================================

-- Policy 1: Service role has full access to repo_archives
CREATE POLICY "Service role full access to repo_archives" ON storage.objects
FOR ALL USING (
    bucket_id = 'repo_archives' AND auth.role() = 'service_role'
);

-- Policy 2: Users can manage their own repo archives (full CRUD)
CREATE POLICY "Users can manage own repo archives" ON storage.objects
FOR ALL USING (
    bucket_id = 'repo_archives' AND
    EXISTS (
        SELECT 1 FROM repos r
        JOIN preflights p ON p.id = r.repo_id
        WHERE r.storage_path = name
        AND p.user_id = auth.uid()
    )
);

-- ============================================
-- VERIFICATION
-- ============================================

-- Check the new policies
SELECT
    policyname,
    roles,
    cmd as allowed_operations,
    qual as policy_condition
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%repo_archives%'
ORDER BY policyname;

-- ============================================
-- IF THIS FAILS:
-- ============================================

/*
If the SQL above fails with permission errors, you MUST recreate the policies manually in the Dashboard:

1. Go to Storage > repo_archives > Policies
2. Delete all existing policies
3. Create these two policies:

POLICY 1: Service Role Full Access
- Name: Service role full access to repo_archives
- Operations: SELECT, INSERT, UPDATE, DELETE
- Role: service_role
- Condition: bucket_id = 'repo_archives' AND auth.role() = 'service_role'

POLICY 2: Users Manage Own Archives
- Name: Users can manage own repo archives
- Operations: SELECT, INSERT, UPDATE, DELETE
- Role: authenticated
- Condition: [paste the complex EXISTS query from above]

This is CRITICAL for security!
*/
