-- ============================================================================
-- Migration: Create Repos Table (Archive-Based Storage)
-- Created: 2025-12-12
-- Description: Stores entire repositories as compressed archives (zipball)
--              Downloaded in ONE API call to avoid GitHub rate limits.
-- ============================================================================

-- Drop old per-file tables
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS repos;

-- ============================================================================
-- REPOS TABLE - One row per repository
-- ============================================================================

CREATE TABLE repos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Link to preflight
    repo_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL, -- "owner/repo"
    branch TEXT NOT NULL DEFAULT 'main',

    -- Archive storage (re-compressed zip)
    archive_blob BYTEA NOT NULL, -- The complete repo archive
    archive_hash TEXT NOT NULL,  -- Hash for change detection
    archive_size INTEGER NOT NULL DEFAULT 0, -- Size in bytes

    -- File index for fast lookup
    -- Structure: { "path/to/file.ts": { size, hash, type, offset } }
    file_index JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: one archive per preflight
    CONSTRAINT unique_repo_archive UNIQUE (repo_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_repos_repo_id ON repos(repo_id);
CREATE INDEX idx_repos_last_accessed ON repos(last_accessed);
CREATE INDEX idx_repos_last_updated ON repos(last_updated);

-- GIN index for querying file_index
CREATE INDEX idx_repos_file_index ON repos USING GIN (file_index);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE repos ENABLE ROW LEVEL SECURITY;

-- Users can view repos from accessible preflights
CREATE POLICY "Users can view repos" ON repos
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
CREATE POLICY "Service role full access" ON repos
    FOR ALL USING (auth.role() = 'service_role');

-- Users can update repos they own
CREATE POLICY "Users can update own repos" ON repos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND p.user_id = auth.uid()
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Touch last_accessed
CREATE OR REPLACE FUNCTION touch_repo(p_repo_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE repos SET last_accessed = NOW() WHERE repo_id = p_repo_id;
END;
$$ LANGUAGE plpgsql;

-- Update last_updated timestamp on archive changes
CREATE OR REPLACE FUNCTION update_repos_last_updated()
RETURNS TRIGGER
SECURITY DEFINER
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

-- Cleanup stale repos
CREATE OR REPLACE FUNCTION cleanup_stale_repos(days_retention INTEGER DEFAULT 7)
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

COMMENT ON TABLE repos IS 'Stores entire repositories as compressed archives. One row per repo.';
COMMENT ON COLUMN repos.archive_blob IS 'Complete repo archive (re-compressed zip)';
COMMENT ON COLUMN repos.file_index IS 'JSONB index of files: {path: {size, hash, type, offset}}';
