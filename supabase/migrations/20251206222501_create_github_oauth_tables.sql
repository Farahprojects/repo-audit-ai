-- Create oauth_csrf_states table for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_csrf_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    state_token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_oauth_csrf_states_expires_at ON oauth_csrf_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_csrf_states_user_id ON oauth_csrf_states(user_id);

-- Create github_accounts table for storing encrypted GitHub tokens
CREATE TABLE IF NOT EXISTS github_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    github_user_id BIGINT NOT NULL UNIQUE,
    login TEXT NOT NULL,
    avatar_url TEXT,
    html_url TEXT,
    access_token_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_github_accounts_user_id ON github_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_github_accounts_github_user_id ON github_accounts(github_user_id);

-- Enable RLS
ALTER TABLE oauth_csrf_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for oauth_csrf_states
-- Only service role can insert/delete CSRF states
CREATE POLICY "Service role can manage oauth_csrf_states" ON oauth_csrf_states
    FOR ALL USING (auth.role() = 'service_role');

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

-- Function to clean up expired CSRF states (can be called by edge functions)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_csrf_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM oauth_csrf_states
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;



