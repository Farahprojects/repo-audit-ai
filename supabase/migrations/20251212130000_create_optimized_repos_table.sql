-- ============================================================================
-- Migration: Create Optimized Repos Table
-- Created: 2025-12-12
-- Description: Optimized table for storing compressed repo files to avoid GitHub rate limits.
--              Replaces/Supersedes the 'files' table concept.
-- ============================================================================

-- Drop the previous files table if it exists as we are replacing it with this optimized version
DROP TABLE IF EXISTS files;

-- ============================================================================
-- REPOS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS repos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID REFERENCES preflights(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL, -- e.g. "owner/repo", kept for easy identification

    -- File identification
    file_path TEXT NOT NULL, -- Full path inside the repo

    -- Content storage (Compressed)
    compressed_content BYTEA, -- Gzipped content
    content_hash TEXT, -- Hash of uncompressed content for change detection

    -- Versioning & Metadata
    version INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb, -- distinct from preview_cache
    preview_cache JSONB DEFAULT '{}'::jsonb, -- AI preview outputs

    -- Timestamps for cleanup and tracking
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Unique index to prevent duplicate files in same repo version
-- (Assuming we want unique paths per repo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_repo_id_path 
    ON repos(repo_id, file_path);

-- Index for lookup by repo
CREATE INDEX IF NOT EXISTS idx_repos_repo_id ON repos(repo_id);

-- Index for lookup by path (useful for globbing)
CREATE INDEX IF NOT EXISTS idx_repos_file_path ON repos(file_path);

-- Index for cleanup (finding old files)
CREATE INDEX IF NOT EXISTS idx_repos_last_accessed ON repos(last_accessed);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE repos ENABLE ROW LEVEL SECURITY;

-- Users can view files from accessible preflights
CREATE POLICY "Users can view repos files" ON repos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

-- Service role can do everything
CREATE POLICY "Service role can manage repos" ON repos
    FOR ALL USING (auth.role() = 'service_role');

-- Users can update files if they own the preflight
CREATE POLICY "Users can update own repos files" ON repos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND p.user_id = auth.uid()
        )
    );

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update last_updated timestamp on change
CREATE OR REPLACE FUNCTION update_repos_last_updated()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repos_last_updated
    BEFORE UPDATE ON repos
    FOR EACH ROW
    EXECUTE FUNCTION update_repos_last_updated();

-- Function to update last_accessed (to be called by application/agents when reading)
-- We don't use a trigger on SELECT (not possible efficiently), so this must be called explicitly or via RPC
CREATE OR REPLACE FUNCTION touch_repo_file(file_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE repos SET last_accessed = NOW() WHERE id = file_id;
END;
$$ LANGUAGE plpgsql;

-- Periodic cleanup function (can be scheduled via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_stale_repo_files(days_retention INTEGER DEFAULT 7)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM repos
    WHERE last_accessed < (NOW() - (days_retention || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE repos IS 'Storage for compressed repository files to avoid GitHub rate limits.';
COMMENT ON COLUMN repos.compressed_content IS 'Gzipped file content (BYTEA)';
COMMENT ON COLUMN repos.preview_cache IS 'Temporary AI preview outputs';
