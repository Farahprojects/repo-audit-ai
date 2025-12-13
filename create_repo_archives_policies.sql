-- ============================================================================
-- INSTRUCTIONS: Create repo_archives bucket via Supabase Dashboard UI
--
-- IMPORTANT: DO NOT run this SQL file directly!
-- Storage policies must be created through the Dashboard UI, not SQL.
-- ============================================================================

/*
MANUAL STEPS REQUIRED:

1. Create Bucket:
   - Go to Supabase Dashboard > Storage
   - Click "Create bucket"
   - Name: repo_archives
   - Set as PRIVATE (uncheck public)

2. Configure Policies via UI:
   - Click on repo_archives bucket
   - Go to "Policies" tab
   - Click "Create policy" for each policy below

POLICY 1: Service Role Full Access
- Name: Service role full access to repo_archives
- Allowed operations: SELECT, INSERT, UPDATE, DELETE
- Policy definition:
  bucket_id = 'repo_archives' AND auth.role() = 'service_role'

POLICY 2: Users Can Manage Own Archives
- Name: Users can manage own repo archives
- Allowed operations: SELECT, INSERT, UPDATE, DELETE
- Target roles: authenticated
- Policy definition:
  bucket_id = 'repo_archives' AND
  EXISTS (
      SELECT 1 FROM repos r
      JOIN preflights p ON p.id = r.repo_id
      WHERE r.storage_path = name
      AND p.user_id = auth.uid()
  )

POLICY 3: Service Role Manage Archives
- Name: Service role manage repo archives
- Allowed operations: INSERT, UPDATE, DELETE
- Policy definition:
  bucket_id = 'repo_archives' AND auth.role() = 'service_role'
- With check:
  bucket_id = 'repo_archives' AND auth.role() = 'service_role'

3. Verify Setup:
   - Try uploading a test file through your app
   - Check that repo storage operations work
*/
