# SQL Policy Management Best Practices

## Quick Reference Guide

### ✅ DO: Dynamic Policy Dropping

```sql
-- Query pg_policies and drop dynamically
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'your_schema'
          AND tablename = 'your_table'
          AND policyname LIKE '%pattern%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON your_schema.your_table', 
                      policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;
```

### ❌ DON'T: Hardcode Auto-Generated Names

```sql
-- NEVER do this - hash suffixes can change!
DROP POLICY IF EXISTS "My Policy 1u5llpa_0" ON table;
DROP POLICY IF EXISTS "My Policy 1u5llpa_1" ON table;
```

### ✅ DO: Use Semantic Policy Names

```sql
-- Use descriptive, stable names when creating policies
CREATE POLICY "Service role full access" ON table
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can manage own data" ON table
FOR ALL USING (user_id = auth.uid());
```

### ✅ DO: Safe Identifier Formatting

```sql
-- Always use %I for identifiers to prevent SQL injection
EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);

-- NEVER concatenate strings for identifiers
-- ❌ UNSAFE:
EXECUTE 'DROP POLICY IF EXISTS "' || policy_name || '" ON ' || table_name;
```

## Common Patterns

### Drop All Policies on a Table

```sql
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'my_table'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON my_table', policy_record.policyname);
    END LOOP;
END $$;
```

### Drop Policies Matching a Pattern

```sql
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'my_table'
          AND policyname LIKE 'old_%'  -- Match pattern
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON my_table', policy_record.policyname);
    END LOOP;
END $$;
```

### Drop and Recreate with Improvements

```sql
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'my_table'
    LOOP
        -- Drop old policy
        EXECUTE format('DROP POLICY IF EXISTS %I ON my_table', policy_record.policyname);
        
        -- Recreate with optimizations (e.g., subqueries for auth functions)
        EXECUTE format(
            'CREATE POLICY %I ON my_table FOR ALL USING ((select auth.uid()) = user_id)',
            policy_record.policyname
        );
    END LOOP;
END $$;
```

### Dry-Run Mode (Preview Changes)

```sql
DO $$
DECLARE
    policy_record RECORD;
    dry_run BOOLEAN := TRUE;  -- Set to FALSE to actually execute
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'my_table'
    LOOP
        IF dry_run THEN
            RAISE NOTICE 'Would drop policy: %', policy_record.policyname;
        ELSE
            EXECUTE format('DROP POLICY IF EXISTS %I ON my_table', policy_record.policyname);
            RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
        END IF;
    END LOOP;
END $$;
```

## Verification Queries

### List All Policies on a Table

```sql
SELECT 
    policyname,
    cmd AS operation,
    roles,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'my_table'
ORDER BY policyname;
```

### Find Policies with Auto-Generated Names

```sql
-- Look for policies with hash-like suffixes
SELECT policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'my_table'
  AND policyname ~ '_[a-z0-9]{7}_[0-9]$';  -- Matches Supabase pattern
```

### Count Policies by Type

```sql
SELECT 
    cmd AS operation,
    COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'my_table'
GROUP BY cmd
ORDER BY cmd;
```

## Red Flags to Watch For

### 🚩 Hardcoded Hash Suffixes

```sql
-- ❌ BAD - Will break when policies are recreated
DROP POLICY IF EXISTS "My Policy 1u5llpa_0" ON table;
```

**Fix:** Use dynamic query to find and drop policies

### 🚩 String Concatenation for Identifiers

```sql
-- ❌ BAD - SQL injection risk
EXECUTE 'DROP POLICY IF EXISTS "' || policy_name || '" ON table';
```

**Fix:** Use `format()` with `%I`

### 🚩 Silent Failures

```sql
-- ⚠️ WARNING - This won't error if policy doesn't exist
DROP POLICY IF EXISTS "Nonexistent Policy" ON table;
```

**Fix:** Add verification queries or use `RAISE NOTICE` to confirm

### 🚩 Multiple Permissive Policies

```sql
-- ⚠️ WARNING - Multiple policies can cause performance issues
CREATE POLICY "Policy 1" ON table FOR SELECT USING (condition1);
CREATE POLICY "Policy 2" ON table FOR SELECT USING (condition2);
```

**Fix:** Combine into a single policy with OR conditions

## Format Specifiers Reference

### `format()` Function

```sql
-- %I - Identifier (table name, column name, policy name)
format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name)

-- %L - Literal value (strings, numbers)
format('SELECT * FROM table WHERE name = %L', user_input)

-- %s - Simple string substitution (use with caution)
format('-- Comment: %s', description)
```

### Why %I is Critical

```sql
-- ✅ SAFE - Properly handles special characters
EXECUTE format('DROP POLICY IF EXISTS %I ON table', 'My "Special" Policy');
-- Result: DROP POLICY IF EXISTS "My ""Special"" Policy" ON table

-- ❌ UNSAFE - Breaks with special characters
EXECUTE 'DROP POLICY IF EXISTS "' || 'My "Special" Policy' || '" ON table';
-- Result: DROP POLICY IF EXISTS "My "Special" Policy" ON table (SYNTAX ERROR!)
```

## Testing Checklist

Before running policy management scripts:

- [ ] Query `pg_policies` to see current state
- [ ] Backup policy definitions
- [ ] Test in staging environment first
- [ ] Use dry-run mode to preview changes
- [ ] Verify no hardcoded hash suffixes
- [ ] Check for SQL injection vulnerabilities
- [ ] Add `RAISE NOTICE` for visibility
- [ ] Plan rollback strategy

After running:

- [ ] Verify old policies were dropped
- [ ] Verify new policies exist
- [ ] Test application functionality
- [ ] Check for permission errors
- [ ] Monitor for performance issues

## Examples from This Codebase

### Good Examples

1. **`20251213083907_fix_repos_rls_performance.sql`** - Dynamic policy fixing
2. **`20251212000002_deprecate_reasoning_tables.sql`** - Pattern-based cleanup
3. **`fix_repo_archives_policies.sql`** (after fix) - Robust storage policy management

### Reference These Files

When writing new policy management scripts, refer to these migration files as templates for best practices.

## Quick Decision Tree

```
Need to drop policies?
│
├─ Know exact policy names? (no hashes)
│  └─ ✅ Use: DROP POLICY IF EXISTS "Exact Name" ON table;
│
├─ Policies have auto-generated suffixes?
│  └─ ✅ Use: Dynamic query with pg_policies
│
├─ Need to drop multiple policies?
│  └─ ✅ Use: DO block with FOR loop
│
├─ Need to recreate policies?
│  └─ ✅ Use: Drop + Create in same DO block
│
└─ Unsure about current state?
   └─ ✅ Use: Dry-run mode first
```

## Summary

**Golden Rules:**
1. Never hardcode auto-generated policy names
2. Always use `format()` with `%I` for identifiers
3. Query `pg_policies` to discover current state
4. Provide feedback with `RAISE NOTICE`
5. Test in staging before production
6. Follow existing migration patterns

**When in Doubt:**
- Look at existing migration files
- Use dynamic queries
- Add dry-run mode
- Ask for code review
