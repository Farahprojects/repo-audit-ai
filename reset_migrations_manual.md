# Database Migration Reset & Consolidation

Since we're in dev mode, we can reset the migration history and start fresh with a clean, consolidated schema.

## ⚠️ IMPORTANT: This will reset your database!

**Only do this if:**
- You're in development mode
- You don't mind losing existing data
- You want a clean migration history

## Step-by-Step Reset Process

### 1. Backup (Optional)
```bash
# Create backup of current migrations
mkdir -p supabase/migrations_backup
cp supabase/migrations/*.sql supabase/migrations_backup/
```

### 2. Remove Old Migrations
```bash
# Remove all existing migration files (keep the consolidated one)
cd supabase/migrations/
ls 202512*.sql | grep -v "20251213082550_consolidated_clean_schema.sql" | xargs rm -f
```

### 3. Reset Local Migration State
```bash
# Reset Supabase CLI migration tracking
npx supabase migration reset
```

### 4. Reset Remote Database (⚠️ DESTRUCTIVE)
```bash
# This will drop and recreate your database - ALL DATA WILL BE LOST
npx supabase db reset
```

### 5. Apply Consolidated Migration
```bash
# Push the clean consolidated migration
npx supabase db push
```

### 6. Verify Setup
```bash
# Run the verification SQL
psql $DATABASE_URL -f check_current_schema.sql
```

## Alternative: Manual Database Reset

If you prefer to do it manually in Supabase Dashboard:

1. Go to **Settings** > **Database**
2. Click **"Reset Database"** (⚠️ This deletes everything!)
3. Run the consolidated migration manually in SQL Editor
4. Run the verification queries

## What the Consolidated Migration Includes

✅ **Clean Schema**: All tables recreated from scratch
✅ **Optimized RLS**: Consolidated policies (no redundancy)
✅ **Proper Indexes**: Only necessary indexes for performance
✅ **Functions & Triggers**: Core functionality preserved
✅ **Default Data**: System prompts and essential data
✅ **Storage Ready**: Prepared for repo_archives bucket

## Post-Reset Verification

After reset, verify:
- [ ] All tables exist with correct structure
- [ ] RLS policies are properly configured
- [ ] Storage bucket and policies exist
- [ ] Application can connect and basic operations work
- [ ] User registration/authentication works
- [ ] Repo audit functionality works

## Benefits of Consolidation

- **46 migrations** → **1 clean migration**
- **Removed bloat** from pivots and failed experiments
- **Optimized RLS** policies (no conflicts)
- **Faster deployments** and easier debugging
- **Clean git history** for migrations

## If You Have Production Data

⚠️ **DO NOT reset if you have production data!**

Instead, create a new migration that cleans up the existing schema without dropping data. Let me know if you need this approach instead.
