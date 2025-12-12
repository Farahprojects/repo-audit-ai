-- ============================================================================
-- Standalone SQL Script: Create Files, Commits, and Repository Imports Tables
-- Run this directly in your Supabase SQL editor or database client
-- ============================================================================

-- ============================================================================
-- FILES TABLE
-- ============================================================================
-- This table stores individual files from GitHub repositories, mirroring the
-- GitHub blob/tree model. Used for repository import and storage before fixes.

CREATE TABLE IF NOT EXISTS public.files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES public.preflights(id) ON DELETE CASCADE,

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
-- INDEXES FOR FILES TABLE
-- ============================================================================

-- Unique index on (repo_id, branch, path) for efficient lookups and upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_repo_branch_path
    ON public.files(repo_id, branch, path);

-- Secondary index on sha for blob deduplication and lookups
CREATE INDEX IF NOT EXISTS idx_files_sha ON public.files(sha);

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON public.files(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_branch ON public.files(branch);
CREATE INDEX IF NOT EXISTS idx_files_commit_id ON public.files(commit_id) WHERE commit_id IS NOT NULL;

-- ============================================================================
-- COMMITS TABLE
-- ============================================================================
-- Lightweight table to record commit metadata for imported repositories

CREATE TABLE IF NOT EXISTS public.commits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES public.preflights(id) ON DELETE CASCADE,

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

CREATE TABLE IF NOT EXISTS public.repository_imports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Repository identification
    repo_id UUID NOT NULL REFERENCES public.preflights(id) ON DELETE CASCADE,

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
-- INDEXES FOR COMMITS AND IMPORTS TABLES
-- ============================================================================

-- Commits table indexes
CREATE INDEX IF NOT EXISTS idx_commits_repo_id ON public.commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_commit_sha ON public.commits(commit_sha);
CREATE INDEX IF NOT EXISTS idx_commits_branch ON public.commits(branch);
CREATE INDEX IF NOT EXISTS idx_commits_imported_at ON public.commits(imported_at DESC);

-- Repository imports table indexes
CREATE INDEX IF NOT EXISTS idx_repository_imports_repo_id ON public.repository_imports(repo_id);
CREATE INDEX IF NOT EXISTS idx_repository_imports_status ON public.repository_imports(status);
CREATE INDEX IF NOT EXISTS idx_repository_imports_created_at ON public.repository_imports(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Files table RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Users can view files from repositories they have access to
CREATE POLICY "Users can view files from accessible repos" ON public.files
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.preflights p
            WHERE p.id = files.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

-- Service role can manage all files
CREATE POLICY "Service role can manage files" ON public.files
    FOR ALL USING (auth.role() = 'service_role');

-- Commits table RLS
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view commits from accessible repos" ON public.commits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.preflights p
            WHERE p.id = commits.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Service role can manage commits" ON public.commits
    FOR ALL USING (auth.role() = 'service_role');

-- Repository imports table RLS
ALTER TABLE public.repository_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view imports from accessible repos" ON public.repository_imports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.preflights p
            WHERE p.id = repository_imports.repo_id
            AND (
                p.user_id = auth.uid() OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Service role can manage repository_imports" ON public.repository_imports
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Files table auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_files_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW
    EXECUTE FUNCTION public.update_files_updated_at();

-- Repository imports auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_repository_imports_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repository_imports_updated_at
    BEFORE UPDATE ON public.repository_imports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_repository_imports_updated_at();

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to start a repository import
CREATE OR REPLACE FUNCTION public.start_repository_import(
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
    INSERT INTO public.repository_imports (repo_id, branch, commit_sha, status, started_at)
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
CREATE OR REPLACE FUNCTION public.complete_repository_import(
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
    UPDATE public.repository_imports
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

COMMENT ON TABLE public.files IS 'GitHub repository files storage mirroring GitHub blob/tree model';
COMMENT ON COLUMN public.files.repo_id IS 'Reference to preflights table (repository metadata)';
COMMENT ON COLUMN public.files.branch IS 'Git branch name (e.g., main, develop)';
COMMENT ON COLUMN public.files.path IS 'Full file path within repository';
COMMENT ON COLUMN public.files.content IS 'File content (text for utf-8, base64 encoded for binary)';
COMMENT ON COLUMN public.files.encoding IS 'Content encoding: utf-8 or base64';
COMMENT ON COLUMN public.files.mode IS 'Git file mode (100644=regular file, 100755=executable, 120000=symlink)';
COMMENT ON COLUMN public.files.sha IS 'Git blob SHA hash';
COMMENT ON COLUMN public.files.size IS 'File size in bytes';
COMMENT ON COLUMN public.files.author IS 'Commit author identifier';
COMMENT ON COLUMN public.files.commit_id IS 'Git commit SHA this file belongs to';

COMMENT ON TABLE public.commits IS 'Commit metadata for imported repository states';
COMMENT ON COLUMN public.commits.repo_id IS 'Reference to preflights table (repository)';
COMMENT ON COLUMN public.commits.commit_sha IS 'Git commit SHA hash';
COMMENT ON COLUMN public.commits.branch IS 'Branch name this commit belongs to';

COMMENT ON TABLE public.repository_imports IS 'Tracks repository import operations and their results';
COMMENT ON COLUMN public.repository_imports.repo_id IS 'Reference to preflights table (repository)';
COMMENT ON COLUMN public.repository_imports.branch IS 'Branch being imported';
COMMENT ON COLUMN public.repository_imports.commit_sha IS 'Commit SHA being imported';
COMMENT ON COLUMN public.repository_imports.status IS 'Import status: pending, in_progress, completed, failed';
COMMENT ON COLUMN public.repository_imports.success IS 'Whether the import completed successfully';
COMMENT ON COLUMN public.repository_imports.errors IS 'Array of error messages encountered during import';