-- Check storage policies
SELECT policyname, roles, cmd as operations, qual as condition
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND policyname LIKE '%repo_archives%'
ORDER BY policyname;
