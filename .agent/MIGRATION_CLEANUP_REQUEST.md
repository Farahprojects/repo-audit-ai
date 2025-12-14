# Migration System Cleanup - Urgent Request

## Problem Statement

Our Supabase migration system is in a broken state with local migration files out of sync with the remote database's migration history table. This is blocking our ability to deploy new schema changes and will become a critical blocker as we scale. The migration list shows mismatches where some migrations exist only locally (20251213004931, 20251213082550, 20251213214545, 20251214000000, 20251214100000), one exists only remotely (20251213004929), and we have invalid backup/skip files cluttering the migrations directory (20251206160000_update_system_prompts.sql.backup, 20251211000000_fix_function_search_path_security.sql.backup, 20251213082550_consolidated_clean_schema.sql.skip). When attempting to push migrations, we get errors about migrations needing to be inserted before the last remote migration, and when we try to repair the migration history, we hit duplicate key constraint violations. Additionally, some migrations are not idempotent and fail when re-run because they try to create policies or indexes that already exist (e.g., "Users can read own audit chunks" policy). We are in active development, not production, so we can afford to reset the database completely if needed. We need a clean, working migration system where local files perfectly match the remote database state, all migrations are idempotent (safe to re-run), and we have clear procedures to prevent this from happening again. The goal is to establish a single source of truth for our schema that we can confidently deploy as we grow, with proper safeguards against manual database edits, clear documentation on migration best practices, and a clean migration history that starts fresh from our current schema state.

## Current State

**Local Migration Files:**
- Total migrations: ~47 files
- Problem files: 3 .backup files, 1 .skip file
- Unapplied migrations: 5 (20251213004931, 20251213082550, 20251213214545, 20251214000000, 20251214100000)
- Missing migrations: 1 (20251213004929 exists remotely but not locally)

**Remote Database:**
- Last applied migration: 20251213160000
- Migration history table has entries that don't match local files
- Some migrations marked as applied but files don't exist locally
- Schema is functional but migration history is corrupted

**Errors Encountered:**
1. "Remote migration versions not found in local migrations directory"
2. "Found local migration files to be inserted before the last migration on remote database"
3. "ERROR: policy 'Users can read own audit chunks' for table 'audit_results_chunks' already exists"
4. "ERROR: duplicate key value violates unique constraint 'schema_migrations_pkey'"
5. "ERROR: column 'github_id' does not exist" (from consolidated schema migration)

## Required Outcome

1. **Clean Migration State**: Local migration files must perfectly match remote database migration history with zero discrepancies
2. **Idempotent Migrations**: All migrations must use IF NOT EXISTS / IF EXISTS patterns so they can be safely re-run
3. **Single Source of Truth**: One clean migration that represents our current schema, with all historical baggage removed
4. **Working Deployment**: `supabase db push` should work without errors or manual intervention
5. **Documentation**: Clear procedures for creating migrations, preventing manual DB edits, and maintaining sync
6. **Prevention Safeguards**: Guidelines and possibly pre-commit hooks to prevent non-idempotent migrations

## Constraints

- We are in development, so database resets are acceptable
- We need to preserve the current schema functionality (all tables, indexes, policies, functions must remain)
- The solution should be production-ready (even though we're in dev, we want proper practices)
- We use Supabase CLI v2.58.5 (though v2.65.5 is available)
- We have a linked remote Supabase project

## Proposed Approach (for AI to validate/improve)

1. **Dump Current Schema**: Export the current working schema from remote database
2. **Clear Migration History**: Delete all local migration files and reset remote migration history table
3. **Create Single Clean Migration**: Generate one idempotent migration representing current schema
4. **Apply and Verify**: Push the clean migration and verify it works
5. **Document Best Practices**: Create migration guidelines for the team
6. **Add Safeguards**: Set up validation to prevent non-idempotent migrations

## Files to Review

- `supabase/migrations/` directory (all .sql files)
- `supabase/config.toml` (project configuration)
- `.agent/storage-logic-fix-summary.md` (recent changes that need to be preserved)
- Migration files specifically mentioned: 20251213004931, 20251213082550, 20251214100000

## Success Criteria

- [ ] `supabase migration list` shows perfect local/remote sync
- [ ] `supabase db push` completes without errors
- [ ] All migrations are idempotent (can run multiple times safely)
- [ ] No .backup or .skip files in migrations directory
- [ ] Documentation exists for migration best practices
- [ ] Team understands how to create and manage migrations properly
- [ ] Current schema functionality is 100% preserved

## Additional Context

We just implemented a critical storage logic fix that uses `owner_repo` as a stable canonical key for repositories instead of ephemeral `preflight_id` values. This change is in the code but the migration (20251214100000_add_owner_repo_to_repos.sql) was only partially applied. We need to ensure this change is properly captured in the clean migration state.

---

**Please provide a step-by-step plan to clean up this migration mess and establish a solid foundation for schema management going forward. We need this fixed before we scale.**
