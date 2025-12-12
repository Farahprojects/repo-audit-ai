-- Drop ALL existing policies first
DROP POLICY IF EXISTS "Users can view their own jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can update their own jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can delete their own audit jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Service role can manage all jobs" ON audit_jobs;

-- Create single optimized policy for audit_jobs
CREATE POLICY "audit_jobs_access_policy" ON audit_jobs
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

-- Verify the policy was created
SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE tablename = 'audit_jobs';
