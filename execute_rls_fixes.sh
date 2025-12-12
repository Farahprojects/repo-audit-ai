#!/bin/bash

# Execute RLS performance fixes directly on Supabase database
# Uses the same connection method as Supabase CLI

export PGHOST="db.zlrivxntdtewfagrbtry.supabase.co"
export PGPORT="5432"
export PGUSER="postgres"
export PGPASSWORD="whggk9TS5KvTZFa3"
export PGDATABASE="postgres"

echo "Connecting to Supabase database..."

# Execute the RLS fixes
psql << 'SQL_EOF'
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

-- Continue with other tables...
DROP POLICY IF EXISTS "Users can view repos" ON repos;
DROP POLICY IF EXISTS "Service role full access" ON repos;
DROP POLICY IF EXISTS "Users can update own repos" ON repos;
DROP POLICY IF EXISTS "repos_access_policy" ON repos;

CREATE POLICY "repos_access_policy" ON repos
    FOR ALL USING (
        (select auth.role()) = 'service_role'
        OR (select auth.uid()) = user_id
    );

SELECT '✅ audit_jobs and repos policies fixed' as status;
SQL_EOF

echo "RLS fixes completed!"
