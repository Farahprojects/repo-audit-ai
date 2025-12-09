-- Migration: Create preflights table for persistent repo metadata
-- This is the single source of truth for all repo-level data before audits run

-- Create preflights table
CREATE TABLE IF NOT EXISTS preflights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Repository identification
    repo_url TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    
    -- Repository metadata (JSONB for flexibility)
    repo_map JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Stats snapshot
    stats JSONB,
    
    -- Fingerprint for complexity analysis
    fingerprint JSONB,
    
    -- Access control flags
    is_private BOOLEAN NOT NULL DEFAULT false,
    fetch_strategy TEXT NOT NULL DEFAULT 'public' CHECK (fetch_strategy IN ('public', 'authenticated')),
    
    -- Token association (nullable for public repos)
    github_account_id UUID REFERENCES github_accounts(id) ON DELETE SET NULL,
    token_valid BOOLEAN DEFAULT true,
    
    -- User who created this preflight (nullable for anonymous users)
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File count cache for quick access
    file_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_preflights_repo_url ON preflights(repo_url);
CREATE INDEX IF NOT EXISTS idx_preflights_user_id ON preflights(user_id);
CREATE INDEX IF NOT EXISTS idx_preflights_github_account_id ON preflights(github_account_id);
CREATE INDEX IF NOT EXISTS idx_preflights_expires_at ON preflights(expires_at);

-- Unique constraint for upsert operations (allows ON CONFLICT)
-- This replaces the partial indexes and enables proper upsert functionality
ALTER TABLE preflights ADD CONSTRAINT preflights_repo_url_user_id_key UNIQUE (repo_url, user_id);

-- Enable RLS
ALTER TABLE preflights ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own preflights
CREATE POLICY "Users can view own preflights" ON preflights
    FOR SELECT USING (
        auth.uid() = user_id OR 
        (user_id IS NULL AND is_private = false)
    );

-- Users can insert their own preflights
CREATE POLICY "Users can insert own preflights" ON preflights
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR 
        (user_id IS NULL AND is_private = false)
    );

-- Users can update their own preflights
CREATE POLICY "Users can update own preflights" ON preflights
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own preflights
CREATE POLICY "Users can delete own preflights" ON preflights
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can manage all preflights
CREATE POLICY "Service role can manage preflights" ON preflights
    FOR ALL USING (auth.role() = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_preflights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_preflights_updated_at
    BEFORE UPDATE ON preflights
    FOR EACH ROW
    EXECUTE FUNCTION update_preflights_updated_at();

-- Function to clean up expired preflights (can be called by edge functions or cron)
CREATE OR REPLACE FUNCTION cleanup_expired_preflights()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM preflights
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE preflights IS 'Persistent repository metadata cache. Single source of truth for repo state before audits run.';
COMMENT ON COLUMN preflights.repo_map IS 'JSONB array of file entries: [{path, size, type, url}]';
COMMENT ON COLUMN preflights.fetch_strategy IS 'How to fetch files: "public" (no auth) or "authenticated" (requires token)';
COMMENT ON COLUMN preflights.token_valid IS 'Whether the associated GitHub token is still valid for this repo';
