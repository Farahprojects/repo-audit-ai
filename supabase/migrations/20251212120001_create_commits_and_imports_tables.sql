-- ============================================================================
-- Migration: Create Commits and Repository Imports Tables
-- Created: 2025-12-12
-- Description: Tables for tracking repository imports and commit metadata
-- ============================================================================

-- ============================================================================
-- COMMITS TABLE
-- ============================================================================
-- Lightweight table to record commit metadata for imported repositories

CREATE TABLE IF NOT EXISTS commits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,

    -- Commit metadata
    commit_sha TEXT NOT NULL,
    branch TEXT NOT NULL,
    message TEXT,
    author TEXT,
    author_email TEXT,
    committed_at TIMESTAMPTZ,

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint to prevent duplicate imports
    UNIQUE(repo_id, commit_sha, branch)
);

-- ============================================================================
-- REPOSITORY IMPORTS TABLE
-- ============================================================================
-- Tracks the status and results of repository import operations

CREATE TABLE IF NOT EXISTS repository_imports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,

    -- Import metadata
    branch TEXT NOT NULL,
    commit_sha TEXT NOT NULL,

    -- Import status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),

    -- Import results
    file_count INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    success BOOLEAN DEFAULT false,

    -- Error tracking
    errors JSONB DEFAULT '[]'::jsonb, -- Array of error messages

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint per repo/branch/commit combination
    UNIQUE(repo_id, branch, commit_sha)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Commits table indexes
CREATE INDEX IF NOT EXISTS idx_commits_repo_id ON commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_commit_sha ON commits(commit_sha);
CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits(branch);
CREATE INDEX IF NOT EXISTS idx_commits_imported_at ON commits(imported_at DESC);

-- Repository imports table indexes
CREATE INDEX IF NOT EXISTS idx_repository_imports_repo_id ON repository_imports(repo_id);
CREATE INDEX IF NOT EXISTS idx_repository_imports_status ON repository_imports(status);
CREATE INDEX IF NOT EXISTS idx_repository_imports_created_at ON repository_imports(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Commits table RLS
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view commits from accessible repos" ON commits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = commits.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Service role can manage commits" ON commits
    FOR ALL USING (auth.role() = 'service_role');

-- Repository imports table RLS
ALTER TABLE repository_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view imports from accessible repos" ON repository_imports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repository_imports.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Service role can manage repository_imports" ON repository_imports
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Repository imports auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_repository_imports_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repository_imports_updated_at
    BEFORE UPDATE ON repository_imports
    FOR EACH ROW
    EXECUTE FUNCTION update_repository_imports_updated_at();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to start a repository import
CREATE OR REPLACE FUNCTION start_repository_import(
    p_repo_id UUID,
    p_branch TEXT,
    p_commit_sha TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_import_id UUID;
BEGIN
    INSERT INTO repository_imports (repo_id, branch, commit_sha, status, started_at)
    VALUES (p_repo_id, p_branch, p_commit_sha, 'in_progress', NOW())
    ON CONFLICT (repo_id, branch, commit_sha)
    DO UPDATE SET
        status = 'in_progress',
        started_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_import_id;

    RETURN v_import_id;
END;
$$;

-- Function to complete a repository import
CREATE OR REPLACE FUNCTION complete_repository_import(
    p_import_id UUID,
    p_success BOOLEAN,
    p_file_count INTEGER DEFAULT 0,
    p_total_size_bytes BIGINT DEFAULT 0,
    p_errors JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE repository_imports
    SET
        status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        success = p_success,
        file_count = p_file_count,
        total_size_bytes = p_total_size_bytes,
        errors = p_errors,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_import_id;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE commits IS 'Commit metadata for imported repository states';
COMMENT ON COLUMN commits.repo_id IS 'Reference to preflights table (repository)';
COMMENT ON COLUMN commits.commit_sha IS 'Git commit SHA hash';
COMMENT ON COLUMN commits.branch IS 'Branch name this commit belongs to';

COMMENT ON TABLE repository_imports IS 'Tracks repository import operations and their results';
COMMENT ON COLUMN repository_imports.repo_id IS 'Reference to preflights table (repository)';
COMMENT ON COLUMN repository_imports.branch IS 'Branch being imported';
COMMENT ON COLUMN repository_imports.commit_sha IS 'Commit SHA being imported';
COMMENT ON COLUMN repository_imports.status IS 'Import status: pending, in_progress, completed, failed';
COMMENT ON COLUMN repository_imports.success IS 'Whether the import completed successfully';
COMMENT ON COLUMN repository_imports.errors IS 'Array of error messages encountered during import';