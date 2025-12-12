-- ============================================================================
-- Migration: GitHub App Integration Schema
-- Created: 2025-12-13
-- Description: Tables and modifications for GitHub App integration to replace OAuth tokens
-- ============================================================================

-- ============================================================================
-- GITHUB APP INSTALLATIONS TABLE
-- ============================================================================
-- Stores GitHub App installation tokens for orgs/users who install the app

CREATE TABLE IF NOT EXISTS github_app_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id BIGINT NOT NULL UNIQUE,
    account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
    account_login TEXT NOT NULL,
    account_id BIGINT NOT NULL,
    access_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    permissions JSONB DEFAULT '{}',
    repository_selection TEXT DEFAULT 'all', -- 'all' or 'selected'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup by account
CREATE UNIQUE INDEX IF NOT EXISTS idx_installations_account ON github_app_installations(account_login);
CREATE INDEX IF NOT EXISTS idx_installations_installation_id ON github_app_installations(installation_id);

-- ============================================================================
-- GITHUB RATE LIMITS TABLE
-- ============================================================================
-- Tracks API rate limits per installation to enable smart scheduling

CREATE TABLE IF NOT EXISTS github_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id BIGINT REFERENCES github_app_installations(installation_id) ON DELETE CASCADE,
    resource TEXT NOT NULL DEFAULT 'core', -- 'core', 'search', 'graphql'
    limit_total INTEGER NOT NULL DEFAULT 5000,
    remaining INTEGER NOT NULL DEFAULT 5000,
    reset_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(installation_id, resource)
);

-- Index for scheduler queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON github_rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_installation ON github_rate_limits(installation_id);

-- ============================================================================
-- GITHUB FILE CACHE TABLE
-- ============================================================================
-- Caches file content with ETag for conditional requests

CREATE TABLE IF NOT EXISTS github_file_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_owner TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    content_sha TEXT NOT NULL, -- Git blob SHA
    etag TEXT, -- GitHub ETag header for conditional requests
    content TEXT, -- Actual file content (or NULL if too large)
    content_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
    UNIQUE(repo_owner, repo_name, file_path, branch)
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_file_cache_lookup ON github_file_cache(repo_owner, repo_name, file_path, branch);
CREATE INDEX IF NOT EXISTS idx_file_cache_expires ON github_file_cache(expires_at);

-- ============================================================================
-- MODIFY AUDIT_JOBS TABLE
-- ============================================================================
-- Add rate-aware scheduling fields

ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS
    installation_id BIGINT REFERENCES github_app_installations(installation_id);

ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS
    estimated_api_calls INTEGER DEFAULT 0;

ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS
    actual_api_calls INTEGER DEFAULT 0;

-- ============================================================================
-- MODIFY PREFLIGHTS TABLE
-- ============================================================================
-- Add installation ID support

ALTER TABLE preflights ADD COLUMN IF NOT EXISTS
    installation_id BIGINT REFERENCES github_app_installations(installation_id);

-- ============================================================================
-- CLEANUP FUNCTION FOR FILE CACHE
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_file_cache() RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER;
BEGIN
    DELETE FROM github_file_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- GitHub App Installations RLS
ALTER TABLE github_app_installations ENABLE ROW LEVEL SECURITY;

-- Users can view installations for their own accounts (if we add user_id later)
-- For now, service role only
CREATE POLICY "Service role can manage github_app_installations" ON github_app_installations
    FOR ALL USING (auth.role() = 'service_role');

-- GitHub Rate Limits RLS
ALTER TABLE github_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage github_rate_limits" ON github_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- GitHub File Cache RLS
ALTER TABLE github_file_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage github_file_cache" ON github_file_cache
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp triggers
CREATE OR REPLACE FUNCTION update_github_app_installations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_github_app_installations_updated_at
    BEFORE UPDATE ON github_app_installations
    FOR EACH ROW
    EXECUTE FUNCTION update_github_app_installations_updated_at();

CREATE OR REPLACE FUNCTION update_github_rate_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_github_rate_limits_updated_at
    BEFORE UPDATE ON github_rate_limits
    FOR EACH ROW
    EXECUTE FUNCTION update_github_rate_limits_updated_at();

CREATE OR REPLACE FUNCTION update_github_file_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_github_file_cache_updated_at
    BEFORE UPDATE ON github_file_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_github_file_cache_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE github_app_installations IS 'GitHub App installation tokens and metadata for orgs/users';
COMMENT ON COLUMN github_app_installations.installation_id IS 'GitHub App installation ID';
COMMENT ON COLUMN github_app_installations.account_type IS 'Type of account: User or Organization';
COMMENT ON COLUMN github_app_installations.account_login IS 'GitHub username or organization name';
COMMENT ON COLUMN github_app_installations.access_token_encrypted IS 'Encrypted installation access token';
COMMENT ON COLUMN github_app_installations.token_expires_at IS 'When the access token expires';

COMMENT ON TABLE github_rate_limits IS 'Tracks GitHub API rate limits per installation';
COMMENT ON COLUMN github_rate_limits.installation_id IS 'Reference to github_app_installations';
COMMENT ON COLUMN github_rate_limits.resource IS 'Rate limit resource type (core, search, graphql)';
COMMENT ON COLUMN github_rate_limits.limit_total IS 'Total API calls allowed per hour';
COMMENT ON COLUMN github_rate_limits.remaining IS 'Remaining API calls before reset';
COMMENT ON COLUMN github_rate_limits.reset_at IS 'When the rate limit resets';

COMMENT ON TABLE github_file_cache IS 'Caches GitHub file content with ETags for conditional requests';
COMMENT ON COLUMN github_file_cache.repo_owner IS 'Repository owner (user/org)';
COMMENT ON COLUMN github_file_cache.repo_name IS 'Repository name';
COMMENT ON COLUMN github_file_cache.content_sha IS 'Git blob SHA for change detection';
COMMENT ON COLUMN github_file_cache.etag IS 'GitHub ETag for conditional requests';
COMMENT ON COLUMN github_file_cache.expires_at IS 'When cache entry expires';

COMMENT ON COLUMN audit_jobs.installation_id IS 'GitHub App installation ID for this job';
COMMENT ON COLUMN audit_jobs.estimated_api_calls IS 'Estimated GitHub API calls needed';
COMMENT ON COLUMN audit_jobs.actual_api_calls IS 'Actual API calls used';

COMMENT ON COLUMN preflights.installation_id IS 'GitHub App installation ID for this repository';