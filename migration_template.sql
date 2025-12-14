-- ============================================================================
-- MIGRATION: [Clear Description of Changes]
-- Created: YYYY-MM-DD HH:MM:SS
-- Description: What this migration does and why
-- Dependencies: Any prerequisites or related migrations
-- ============================================================================

-- ============================================
-- CHANGES
-- ============================================

-- Example: Add new column (ALWAYS use IF NOT EXISTS)
-- ALTER TABLE table_name ADD COLUMN IF NOT EXISTS new_column TYPE;

-- Example: Create index (ALWAYS use IF NOT EXISTS)
-- CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);

-- Example: Create policy (ALWAYS drop first to ensure clean state)
-- DROP POLICY IF EXISTS "policy_name" ON table_name;
-- CREATE POLICY "policy_name" ON table_name ...;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Uncomment these queries to verify your changes work correctly:

-- Check if column exists:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'table_name' AND column_name = 'column_name';

-- Check if index exists:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'table_name' AND indexname = 'idx_name';

-- Check if policy exists:
-- SELECT schemaname, tablename, policyname FROM pg_policies
-- WHERE tablename = 'table_name' AND policyname = 'policy_name';