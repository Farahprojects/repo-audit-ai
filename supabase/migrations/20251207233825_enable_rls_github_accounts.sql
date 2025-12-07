-- Enable Row Level Security on github_accounts table (if not already enabled)
ALTER TABLE github_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can insert own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can update own github_accounts" ON github_accounts;
DROP POLICY IF EXISTS "Service role can manage github_accounts" ON github_accounts;

-- RLS policies for github_accounts
-- Users can only see their own GitHub accounts
CREATE POLICY "Users can view own github_accounts" ON github_accounts
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own GitHub accounts
CREATE POLICY "Users can insert own github_accounts" ON github_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own GitHub accounts
CREATE POLICY "Users can update own github_accounts" ON github_accounts
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role can manage all GitHub accounts
CREATE POLICY "Service role can manage github_accounts" ON github_accounts
    FOR ALL USING (auth.role() = 'service_role');
