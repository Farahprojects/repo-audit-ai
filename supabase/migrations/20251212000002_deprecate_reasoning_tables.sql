-- ============================================================================
-- Migration: Deprecate Reasoning Tables
-- Created: 2025-12-12
-- Description: Clean removal of old orchestrator tables and functions
-- ============================================================================

-- The reasoning_* tables were for the universal orchestrator.
-- We're moving to a simpler queue-based system.
-- Since user confirmed "go hard, no rollback", we'll drop these immediately.

-- 1. Remove from realtime publication first
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS reasoning_sessions;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if not in publication
    NULL;
END;
$$;

-- 2. Drop tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS reasoning_checkpoints CASCADE;
DROP TABLE IF EXISTS reasoning_steps CASCADE;
DROP TABLE IF EXISTS reasoning_sessions CASCADE;

-- 3. Drop the cleanup function if it exists
DROP FUNCTION IF EXISTS cleanup_old_reasoning_sessions(INTEGER);

-- 4. Clean up any orphaned policies
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop any policies on tables that might reference the dropped tables
    FOR r IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE tablename LIKE 'reasoning_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END;
$$;

-- 5. Log the cleanup
DO $$
BEGIN
    RAISE NOTICE 'Deprecated reasoning tables have been removed. Queue-based architecture is now active.';
END;
$$;

COMMENT ON TABLE audit_jobs IS 'Queue for audit job processing. Replaces the old reasoning_sessions/steps/checkpoints tables.';
