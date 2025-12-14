# Migration System Cleanup and Best Practices

## Incident Summary

**Date:** December 14, 2025
**Issue:** Supabase migration system was broken with local files out of sync with remote database migration history.

### Problems Identified:
1. **Migration Sync Issues**: Local migrations existed that weren't applied remotely
2. **Non-idempotent Migrations**: Policies created without `IF NOT EXISTS` causing failures on re-run
3. **Invalid Files**: `.backup` and `.skip` files cluttering migration directory
4. **Push Failures**: `supabase db push` errors about migrations needing to be inserted before last remote migration
5. **Repair Failures**: `supabase migration repair` failed with duplicate key constraint violations

### Root Cause:
- Inconsistent application of migrations during development
- Lack of idempotency in migration scripts
- Accumulation of invalid migration files

## Resolution Applied

### 1. Database Backup
- Created schema backup: `schema_backup_20251214_092602.sql`
- **ALWAYS CREATE BACKUPS BEFORE MAJOR MIGRATION CHANGES**

### 2. Migration Directory Cleanup
**Removed Files:**
- `20251213082550_consolidated_clean_schema.sql` (non-idempotent policies)
- `20251213082550_consolidated_clean_schema.sql.skip`
- `20251213214545_add_commit_sha_to_repos.sql` (unapplied)
- `20251214000000_add_installation_id_to_preflights.sql` (unapplied)
- All `*.backup` files

**Kept Files:**
- All properly applied migrations that match remote state
- `20251214100000_add_owner_repo_to_repos.sql` (critical functionality preserved)

### 3. Consolidated Migration Creation
Created `20251214200000_consolidate_missing_schema_changes.sql` with:
- **Idempotent column additions** using `IF NOT EXISTS`
- **Idempotent index creation** using `IF NOT EXISTS`
- **Verification queries** (commented out for future reference)

### 4. Verification
- Migration list shows perfect local/remote sync
- `supabase db push` works without errors
- All schema functionality preserved

## Best Practices - IMMEDIATE IMPLEMENTATION REQUIRED

### Migration Writing Standards

#### ✅ ALWAYS Use Idempotent Patterns

**Columns:**
```sql
-- GOOD
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;

-- BAD
ALTER TABLE table_name ADD COLUMN column_name TYPE;
```

**Indexes:**
```sql
-- GOOD
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);

-- BAD
CREATE INDEX idx_name ON table_name(column);
```

**Policies:**
```sql
-- GOOD
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name ...;

-- BAD
CREATE POLICY "policy_name" ON table_name ...;
```

**Tables:**
```sql
-- GOOD
CREATE TABLE IF NOT EXISTS table_name (...);

-- BAD
CREATE TABLE table_name (...);
```

#### ✅ Migration File Naming
- Use timestamp format: `YYYYMMDDHHMMSS_description.sql`
- Descriptions should be clear and concise
- No special characters except underscores

#### ✅ Migration Structure
```sql
-- ============================================================================
-- MIGRATION: Clear Description
-- Created: YYYY-MM-DD HH:MM:SS
-- Description: What this migration does
-- Dependencies: Any prerequisites
-- ============================================================================

-- Your SQL here

-- ============================================================================
-- VERIFICATION (optional but recommended)
-- ============================================================================
-- Uncomment to verify changes:
/*
SELECT column_name FROM information_schema.columns
WHERE table_name = 'table_name' AND column_name = 'column_name';
*/
```

### Development Workflow

#### ✅ Pre-Migration Checklist
1. **Create backup**: `supabase db dump -s public --file backup_$(date +%Y%m%d_%H%M%S).sql`
2. **Check migration status**: `supabase migration list`
3. **Review changes**: Ensure all SQL uses idempotent patterns
4. **Test locally**: `supabase db reset` if using local development

#### ✅ Post-Migration Verification
1. **Push changes**: `supabase db push`
2. **Verify sync**: `supabase migration list` shows all migrations applied
3. **Generate types**: `supabase gen types typescript --linked > types.ts`
4. **Test functionality**: Ensure application works with new schema

### File Management

#### ✅ Prohibited Files in `/migrations/`
- `*.backup` - Delete immediately
- `*.skip` - Delete immediately
- Non-timestamp files - Move to appropriate location
- Temporary files - Clean up after use

#### ✅ Git Workflow
```bash
# After creating migration
git add supabase/migrations/
git commit -m "Add migration: description of changes"
git push origin main

# Then apply to database
supabase db push
```

### Emergency Recovery

#### If Migration System Breaks Again:
1. **STOP IMMEDIATELY** - Don't make more changes
2. **Create backup**: `supabase db dump -s public --file emergency_backup.sql`
3. **Check status**: `supabase migration list` to identify discrepancies
4. **Clean directory**: Remove invalid files (`.backup`, `.skip`)
5. **Consolidate**: Create single idempotent migration for missing changes
6. **Test**: Push and verify before resuming development

### Monitoring and Alerts

#### ✅ Regular Checks
- Run `supabase migration list` after every push
- Ensure no local-only or remote-only migrations
- Verify `supabase db push` works without prompts

#### ✅ Warning Signs
- Migration list shows discrepancies
- `supabase db push` asks for confirmation
- Error messages about duplicate keys/policies
- Presence of `.backup` or `.skip` files

## Current Schema Status

**✅ VERIFIED WORKING:**
- All migrations in sync (local = remote)
- `supabase db push` works without errors
- `supabase migration repair` no longer needed
- All critical functionality preserved:
  - `owner_repo` column in repos table (canonical key)
  - `installation_id` column in preflights table
  - `commit_sha` column in repos table

**Schema Backup:** `schema_backup_20251214_092602.sql`

## Future Recommendations

1. **Implement automated testing** for migrations
2. **Add pre-commit hooks** to validate migration files
3. **Create migration templates** with proper structure
4. **Document schema changes** in team wiki
5. **Set up monitoring** for migration sync status

## Success Criteria Met ✅

- ✅ Perfect local/remote sync
- ✅ Idempotent migrations
- ✅ No backup/skip files
- ✅ Working `supabase db push`
- ✅ Clear documentation
- ✅ 100% preserved schema functionality

---

**Prepared by:** Migration Cleanup Team
**Approved:** Ready for production use