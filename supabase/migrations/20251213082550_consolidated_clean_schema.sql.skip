-- ============================================================================
-- CONSOLIDATED CLEAN SCHEMA - Final Working State
-- Created: 2025-12-13
--
-- This migration represents the clean, consolidated state after removing
-- all the bloat from previous pivots and migrations.
--
-- TABLES INCLUDED:
-- - Core audit system (audit_jobs, audit_status, audit_complete_data)
-- - Repository storage (repos, preflights)
-- - User management (github_accounts, verification_codes)
-- - Email system (system_prompts)
--
-- All RLS policies are consolidated and optimized.
-- ============================================================================

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES (Create if not exists)
-- ============================================

-- Users table (managed by Supabase Auth)
-- This is automatically created by Supabase

-- GitHub Accounts
CREATE TABLE IF NOT EXISTS github_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    github_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification Codes for Email
CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL, -- 'email_verification', 'password_reset'
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System Prompts for AI Agents
CREATE TABLE IF NOT EXISTS system_prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tier TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    credit_cost INTEGER NOT NULL DEFAULT 1,
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preflights (Repository Analysis Preparation)
CREATE TABLE IF NOT EXISTS preflights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    github_account_id UUID REFERENCES github_accounts(id) ON DELETE SET NULL,
    repo_url TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    is_private BOOLEAN NOT NULL DEFAULT false,
    fingerprint TEXT, -- For change detection
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repos (Repository Storage in Supabase Storage)
CREATE TABLE IF NOT EXISTS repos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,
    repo_name TEXT NOT NULL, -- "owner/repo"
    branch TEXT NOT NULL DEFAULT 'main',
    storage_path TEXT NOT NULL, -- Path in 'repo_archives' bucket
    archive_hash TEXT NOT NULL,  -- Hash for change detection
    archive_size INTEGER NOT NULL DEFAULT 0, -- Size in bytes
    file_index JSONB NOT NULL DEFAULT '{}'::jsonb, -- File metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_repo_archive UNIQUE (repo_id)
);

-- Audit Jobs (Main audit orchestration)
CREATE TABLE IF NOT EXISTS audit_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    preflight_id UUID REFERENCES preflights(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Audit Status (Real-time job progress)
CREATE TABLE IF NOT EXISTS audit_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    preflight_id UUID REFERENCES preflights(id) ON DELETE CASCADE,
    job_id UUID REFERENCES audit_jobs(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    logs TEXT DEFAULT '',
    worker_progress JSONB DEFAULT '[]'::jsonb,
    plan_data JSONB,
    token_usage JSONB DEFAULT '{"planner": 0, "workers": 0, "coordinator": 0}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Complete Data (Final results storage)
CREATE TABLE IF NOT EXISTS audit_complete_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    audit_job_id UUID REFERENCES audit_jobs(id) ON DELETE SET NULL,
    repo_url TEXT NOT NULL,
    tier TEXT NOT NULL,
    health_score INTEGER,
    summary TEXT,
    issues JSONB DEFAULT '[]'::jsonb,
    total_tokens INTEGER DEFAULT 0,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Create if not exists)
-- ============================================

-- GitHub Accounts
CREATE INDEX IF NOT EXISTS idx_github_accounts_user_id ON github_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_github_accounts_github_id ON github_accounts(github_id);

-- Verification Codes
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);

-- System Prompts
CREATE INDEX IF NOT EXISTS idx_system_prompts_tier ON system_prompts(tier);

-- Preflights
CREATE INDEX IF NOT EXISTS idx_preflights_user_id ON preflights(user_id);
CREATE INDEX IF NOT EXISTS idx_preflights_github_account_id ON preflights(github_account_id);
CREATE INDEX IF NOT EXISTS idx_preflights_repo_url ON preflights(repo_url);

-- Repos
CREATE INDEX IF NOT EXISTS idx_repos_repo_id ON repos(repo_id);
CREATE INDEX IF NOT EXISTS idx_repos_last_accessed ON repos(last_accessed);
CREATE INDEX IF NOT EXISTS idx_repos_last_updated ON repos(last_updated);
CREATE INDEX IF NOT EXISTS idx_repos_file_index ON repos USING GIN (file_index);

-- Audit Jobs
CREATE INDEX IF NOT EXISTS idx_audit_jobs_user_id ON audit_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_preflight_id ON audit_jobs(preflight_id);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_status ON audit_jobs(status);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_created_at ON audit_jobs(created_at);

-- Audit Status
CREATE INDEX IF NOT EXISTS idx_audit_status_preflight_id ON audit_status(preflight_id);
CREATE INDEX IF NOT EXISTS idx_audit_status_job_id ON audit_status(job_id);

-- Audit Complete Data
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_user_id ON audit_complete_data(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_audit_job_id ON audit_complete_data(audit_job_id);
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_repo_url ON audit_complete_data(repo_url);
CREATE INDEX IF NOT EXISTS idx_audit_complete_data_created_at ON audit_complete_data(created_at);

-- ============================================
-- RLS POLICIES (Drop and recreate for consolidation)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE github_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE preflights ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_complete_data ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies first
DROP POLICY IF EXISTS "Users can view own github accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can insert own github accounts" ON github_accounts;
DROP POLICY IF EXISTS "Users can update own github accounts" ON github_accounts;
DROP POLICY IF EXISTS "Service role full access to github accounts" ON github_accounts;

DROP POLICY IF EXISTS "Users can view own verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Users can insert own verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Users can update own verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Service role full access to verification codes" ON verification_codes;

DROP POLICY IF EXISTS "Authenticated users can view system prompts" ON system_prompts;
DROP POLICY IF EXISTS "Service role full access to system prompts" ON system_prompts;

DROP POLICY IF EXISTS "Users can view own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can insert own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can update own preflights" ON preflights;
DROP POLICY IF EXISTS "Users can delete own preflights" ON preflights;
DROP POLICY IF EXISTS "Service role full access to preflights" ON preflights;

-- Repos policies (these will be optimized in the next migration)
DROP POLICY IF EXISTS "Users can view repos from accessible preflights" ON repos;
DROP POLICY IF EXISTS "Users can update own repos" ON repos;
DROP POLICY IF EXISTS "Service role full access to repos" ON repos;

DROP POLICY IF EXISTS "Users can view own audit jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can insert own audit jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Users can update own audit jobs" ON audit_jobs;
DROP POLICY IF EXISTS "Service role full access to audit jobs" ON audit_jobs;

DROP POLICY IF EXISTS "Users can view audit status for own preflights" ON audit_status;
DROP POLICY IF EXISTS "Service role full access to audit status" ON audit_status;

DROP POLICY IF EXISTS "Users can view own audit results" ON audit_complete_data;
DROP POLICY IF EXISTS "Service role full access to audit complete data" ON audit_complete_data;

-- GitHub Accounts: Users can only see their own
CREATE POLICY "Users can view own github accounts" ON github_accounts
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own github accounts" ON github_accounts
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own github accounts" ON github_accounts
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access to github accounts" ON github_accounts
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Verification Codes: Users can only see their own
CREATE POLICY "Users can view own verification codes" ON verification_codes
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own verification codes" ON verification_codes
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own verification codes" ON verification_codes
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access to verification codes" ON verification_codes
    FOR ALL USING ((select auth.role()) = 'service_role');

-- System Prompts: Read-only for all authenticated users
CREATE POLICY "Authenticated users can view system prompts" ON system_prompts
    FOR SELECT USING ((select auth.role()) = 'authenticated');

CREATE POLICY "Service role full access to system prompts" ON system_prompts
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Preflights: Users can see their own, service role can see all
CREATE POLICY "Users can view own preflights" ON preflights
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own preflights" ON preflights
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own preflights" ON preflights
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own preflights" ON preflights
    FOR DELETE USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access to preflights" ON preflights
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Repos policies (optimized versions will be created in the next migration)
-- For now, create basic working policies that will be replaced
CREATE POLICY "Users can view repos from accessible preflights" ON repos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND (
                p.user_id = (select auth.uid()) OR
                (p.user_id IS NULL AND p.is_private = false)
            )
        )
    );

CREATE POLICY "Users can update own repos" ON repos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = repos.repo_id
            AND p.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Service role full access to repos" ON repos
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Audit Jobs: Users can see their own, service role can see all
CREATE POLICY "Users can view own audit jobs" ON audit_jobs
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own audit jobs" ON audit_jobs
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own audit jobs" ON audit_jobs
    FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access to audit jobs" ON audit_jobs
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Audit Status: Users can see status for their preflights, service role can see all
CREATE POLICY "Users can view audit status for own preflights" ON audit_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM preflights p
            WHERE p.id = audit_status.preflight_id
            AND p.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Service role full access to audit status" ON audit_status
    FOR ALL USING ((select auth.role()) = 'service_role');

-- Audit Complete Data: Users can see their own results, service role can see all
CREATE POLICY "Users can view own audit results" ON audit_complete_data
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access to audit complete data" ON audit_complete_data
    FOR ALL USING ((select auth.role()) = 'service_role');

-- ============================================
-- FUNCTIONS (Create or replace)
-- ============================================

-- Updated at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Repo access tracking
CREATE OR REPLACE FUNCTION touch_repo(p_repo_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE repos SET last_accessed = NOW() WHERE repo_id = p_repo_id;
END;
$$ LANGUAGE plpgsql;

-- Repo cleanup
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

-- Get user active audits
CREATE OR REPLACE FUNCTION get_user_active_audits(p_user_id UUID)
RETURNS TABLE(
    preflight_id UUID,
    repo_url TEXT,
    tier TEXT,
    status TEXT,
    progress INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        aj.preflight_id,
        p.repo_url,
        aj.tier,
        aj.status,
        COALESCE(ast.progress, 0) AS progress,
        aj.created_at
    FROM audit_jobs aj
    JOIN preflights p ON p.id = aj.preflight_id
    LEFT JOIN audit_status ast ON ast.preflight_id = aj.preflight_id
    WHERE aj.user_id = p_user_id
      AND aj.status IN ('pending', 'processing')
    ORDER BY aj.created_at DESC;
$$;

-- Cancel audit job
CREATE OR REPLACE FUNCTION cancel_audit_job(p_job_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET
        status = 'cancelled',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id
      AND user_id = p_user_id
      AND status IN ('pending', 'processing');

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count > 0 THEN
        UPDATE audit_status
        SET
            status = 'cancelled',
            updated_at = NOW()
        WHERE job_id = p_job_id;
    END IF;

    RETURN v_row_count > 0;
END;
$$;

-- ============================================
-- TRIGGERS (Drop if exists, then create)
-- ============================================

-- Clean up existing triggers first
DROP TRIGGER IF EXISTS update_github_accounts_updated_at ON github_accounts;
DROP TRIGGER IF EXISTS update_preflights_updated_at ON preflights;
DROP TRIGGER IF EXISTS update_audit_jobs_updated_at ON audit_jobs;
DROP TRIGGER IF EXISTS update_audit_status_updated_at ON audit_status;
DROP TRIGGER IF EXISTS update_repos_last_updated ON repos;

-- Updated at triggers for all tables with updated_at
CREATE TRIGGER update_github_accounts_updated_at
    BEFORE UPDATE ON github_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_preflights_updated_at
    BEFORE UPDATE ON preflights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audit_jobs_updated_at
    BEFORE UPDATE ON audit_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audit_status_updated_at
    BEFORE UPDATE ON audit_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Repo last_updated trigger
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

CREATE TRIGGER update_repos_last_updated
    BEFORE UPDATE ON repos
    FOR EACH ROW EXECUTE FUNCTION update_repos_last_updated();

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert system prompts (consolidated from previous migrations)
INSERT INTO system_prompts (tier, name, description, credit_cost, prompt) VALUES
('shape', 'Repo Shape Check', 'Shape-level structural analysis of project organization and basic conventions', 2,
'I want you to perform a shape-level analysis of this repo. Don''t review individual code logic yet. Just evaluate the structural health of the project. Specifically check: Folder structure clarity, Dependency hygiene (package.json / imports), Config + environment file setup, API + routing organization, Authentication flow structure, Error handling patterns, How well the repo reflects senior-level conventions, Any signs of AI-generated shortcuts or missing pieces, Anything a hiring manager would consider a red flag. After your analysis, give me: • A high-level repo maturity score (0–100) • Top 5 strengths • Top 5 issues • Any suspicious or missing files • Whether the repo looks like it was produced by a senior dev • A summary in under 10 bullet points DO NOT fix anything yet. DO NOT generate new code yet. Just analyze the shape and presentation of the repo.'),

('conventions', 'Senior Conventions Check', 'Structural health analysis of project organization, dependencies, and senior-level conventions', 4,
'I want you to perform a structural health analysis of this repo. Don''t review individual code logic yet. Just evaluate the structural health of the project. Specifically check: 1. Folder structure clarity 2. Dependency hygiene (package.json / imports) 3. Config + environment file setup 4. API + routing organization 5. Authentication flow structure 6. Error handling patterns 7. How well the repo reflects senior-level conventions 8. Any signs of AI-generated shortcuts or missing pieces 9. Anything a hiring manager would consider a red flag After your analysis, give me: • A high-level repo maturity score (0–100) • Top 5 strengths • Top 5 issues • Any suspicious or missing files • Whether the repo looks like it was produced by a senior dev • A summary in under 10 bullet points DO NOT fix anything yet. DO NOT generate new code yet. Just analyze the shape and presentation of the repo.'),

('performance', 'Performance Deep Dive', 'Deep performance + AI-anti-pattern audit focusing on hidden structural issues and AI-generated shortcuts', 6,
'I want you to perform a deep performance + AI-anti-pattern audit of this repo. Do NOT look at code style. Do NOT review aesthetics. Focus only on hidden structural issues that degrade performance or reveal AI-generated shortcuts. Specifically check for: Hidden N+1 or chatty data-fetching patterns, Repeated database calls across components or services, State management issues causing unnecessary re-renders, Expensive functions declared inside React render bodies, Components that re-render large trees for no reason, Un-memoized context values, selectors, or providers, Duplicate or near-duplicate utility logic created by AI, Dead code, unused modules, abandoned helpers, Conflicting or drifted logic across similar functions, Silent error swallowing, vague catch blocks, or suppressed exceptions, Supabase edge function anti-patterns (repeated auth code, slow cold-start patterns, no input validation, overly permissive logic), Memory leaks from subscriptions, listeners, or real-time events not being cleaned up. After your audit, give me: • A performance risk score (0–100) • Top 10 invisible performance risks • Top 5 AI-generated anti-patterns you found • Any duplicated or abandoned logic • Any slow-paths or async misuse • Any missing memoization or re-render bombs • A list of files that need urgent refactoring • Whether this repo is "performance ready" for production'),

('security', 'Security Audit', 'Comprehensive security vulnerability analysis including database security, auth, API security, and AI-generated code risks', 10,
'You are a WORKER AGENT in a multi-agent code audit system. You are analyzing ONE CHUNK of a larger codebase. OUTPUT FORMAT (return ONLY valid JSON): {"localScore": <number 0-100>, "confidence": <number 0.0-1.0>, "issues": [{"id": "<unique_id>", "severity": "critical" | "warning" | "info", "category": "<category>", "title": "<short title>", "description": "<detailed finding>", "file": "<file path>", "line": <line number or null>, "badCode": "<problematic code snippet if applicable>", "fixedCode": "<corrected code if applicable>", "suggestion": "<actionable fix>"}], "crossFileFlags": ["<dependency or concern that affects other chunks>"], "uncertainties": ["<things you couldn''t determine from this chunk alone>"]} ## YOUR ANALYSIS FOCUS: SECURITY & TRUSTWORTHINESS AUDIT You are performing a focused security audit. Do NOT evaluate code style or architecture. Only evaluate REAL security risks — especially those common in AI-generated projects. ### 1. **Supabase RLS & Database Security** - RLS policies enabled on all tables? - Over-permissive policies (e.g., "true" or missing WHERE clauses)? - Policies that can be bypassed via edge functions or service role? - Functions using service_role that bypass RLS unintentionally? - Missing policies for INSERT/UPDATE/DELETE operations? - User data accessible to other users? ### 2. **Authentication & Authorization** - JWT misuse (decoding on client, exposing tokens, missing refresh logic)? - Missing auth guards on protected routes/functions? - Role-based access control gaps or privilege escalation paths? - Unsafe redirect or callback flows in auth? - Session handling vulnerabilities? ### 3. **Edge Function & API Security** - Missing input validation/sanitization? - Functions exposing more data than necessary? - Error responses leaking sensitive info (stack traces, DB structure)? - CORS misconfiguration allowing unauthorized origins? - Missing rate limiting on sensitive endpoints? ### 4. **Secret & Credential Management** - API keys or secrets hardcoded in code? - Secrets exposed in client-side bundles? - Credentials logged or exposed in error messages? - .env files committed or secrets in version control? ### 5. **Client-Side Security** - Unsafe localStorage/sessionStorage usage for sensitive data? - Sensitive tokens or PII stored client-side? - XSS vulnerabilities (dangerouslySetInnerHTML, unescaped user input)? - Insecure data handling in browser? ### 6. **Input Validation & Injection** - SQL/NoSQL injection vulnerabilities? - Path traversal risks? - Unvalidated user input passed to queries or functions? - Command injection possibilities? ### 7. **AI-Generated Code Security Red Flags** - TODO/FIXME comments around security-critical code? - Placeholder auth checks that aren''t implemented? - Inconsistent security patterns across files? - Copy-pasted security code that may not fit context? - Error boundaries missing or leaking sensitive info? ### 8. **Production Readiness** - Debug code or console.logs exposing sensitive data? - Development-only bypasses still active? - Missing HTTPS enforcement? - Weak or missing Content Security Policy? For EACH issue found, provide: severity, CWE reference, exact file and line, badCode snippet, fixedCode snippet, actionable suggestion. Use category: "security"')
ON CONFLICT DO NOTHING;

-- ============================================
-- FINAL CLEANUP
-- ============================================

-- Log successful consolidation
DO $$
BEGIN
    RAISE NOTICE '🎉 Database consolidation complete!';
    RAISE NOTICE '✅ All tables created with proper indexes';
    RAISE NOTICE '✅ RLS policies configured for security';
    RAISE NOTICE '✅ Functions and triggers set up';
    RAISE NOTICE '✅ Default data inserted';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run: npx supabase db push --include-all';
    RAISE NOTICE '2. Verify with: check_current_schema.sql';
    RAISE NOTICE '3. Test the application';
END;
$$;
