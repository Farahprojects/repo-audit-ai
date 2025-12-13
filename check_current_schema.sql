-- ============================================================================
-- Check Current Database Schema and RLS Policies
-- Run this in Supabase SQL Editor to see what we have
-- ============================================================================

-- ============================================
-- TABLES AND THEIR STRUCTURES
-- ============================================

-- List all tables in public schema
SELECT
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================
-- RLS POLICIES SUMMARY
-- ============================================

-- Count policies per table
SELECT
    schemaname,
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ============================================
-- DETAILED RLS POLICIES
-- ============================================

-- Show all RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as allowed_operations,
    qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- KEY TABLES DETAILS
-- ============================================

-- Check repos table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'repos'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check preflights table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'preflights'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check audit_jobs table structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'audit_jobs'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- List functions
SELECT
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- List triggers
SELECT
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
