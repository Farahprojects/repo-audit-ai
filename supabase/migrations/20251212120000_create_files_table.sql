-- ============================================================================
-- Migration: Create Files Table for GitHub Repository Storage
-- Created: 2025-12-12
-- Description: Table to store GitHub repository files mirroring GitHub's blob/tree model
-- ============================================================================

-- ============================================================================
-- FILES TABLE
-- ============================================================================
-- This table stores individual files from GitHub repositories, mirroring the
-- GitHub blob/tree model. Used for repository import and storage before fixes.

CREATE TABLE IF NOT EXISTS files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,

    -- Git references
    branch TEXT NOT NULL,
    path TEXT NOT NULL, -- Full path string (e.g., "src/main.js")

    -- File content and metadata
    content TEXT, -- File content as text/blob
    encoding TEXT NOT NULL CHECK (encoding IN ('utf-8', 'base64')),
    mode TEXT NOT NULL DEFAULT '100644', -- Git file mode (e.g., '100644', '100755', '120000')
    sha TEXT NOT NULL, -- Git blob SHA
    size INTEGER NOT NULL DEFAULT 0, -- File size in bytes

    -- Commit metadata
    author TEXT, -- Author name/email or identifier
    commit_id TEXT, -- Git commit SHA this file belongs to

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Unique index on (repo_id, branch, path) for efficient lookups and upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_repo_branch_path
    ON files(repo_id, branch, path);

-- Secondary index on sha for blob deduplication and lookups
CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha);

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_branch ON files(branch);
CREATE INDEX IF NOT EXISTS idx_files_commit_id ON files(commit_id) WHERE commit_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Users can view files from repositories they have access to
CREATE POLICY "Users can view files from accessible repos" ON files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = files.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

-- Service role can manage all files
CREATE POLICY "Service role can manage files" ON files
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_files_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_files_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE files IS 'GitHub repository files storage mirroring GitHub blob/tree model';
COMMENT ON COLUMN files.repo_id IS 'Reference to preflights table (repository metadata)';
COMMENT ON COLUMN files.branch IS 'Git branch name (e.g., main, develop)';
COMMENT ON COLUMN files.path IS 'Full file path within repository';
COMMENT ON COLUMN files.content IS 'File content (text for utf-8, base64 encoded for binary)';
COMMENT ON COLUMN files.encoding IS 'Content encoding: utf-8 or base64';
COMMENT ON COLUMN files.mode IS 'Git file mode (100644=regular file, 100755=executable, 120000=symlink)';
COMMENT ON COLUMN files.sha IS 'Git blob SHA hash';
COMMENT ON COLUMN files.size IS 'File size in bytes';
COMMENT ON COLUMN files.author IS 'Commit author identifier';
COMMENT ON COLUMN files.commit_id IS 'Git commit SHA this file belongs to';