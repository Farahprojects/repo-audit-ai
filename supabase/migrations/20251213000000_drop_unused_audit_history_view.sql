-- ============================================================================
-- Migration: Drop unused audit_history view
-- Created: 2025-12-13
-- Description: Remove the audit_history view that is not used in the codebase
-- ============================================================================

-- Drop the unused audit_history view
DROP VIEW IF EXISTS audit_history;

-- Add comment explaining the removal
-- This view was created to consolidate audit data from multiple tables
-- but is not referenced anywhere in the current codebase.
-- It can be safely dropped to simplify the database schema.
