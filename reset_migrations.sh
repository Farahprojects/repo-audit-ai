# Reset migration history and start fresh with consolidated schema

# 1. Backup current migrations (optional)
mkdir -p supabase/migrations_backup
cp supabase/migrations/*.sql supabase/migrations_backup/ 2>/dev/null || true

# 2. Remove all existing migrations
rm -f supabase/migrations/202512*.sql

# 3. Keep only the consolidated migration
mv supabase/migrations/20251213082550_consolidated_clean_schema.sql.keep supabase/migrations/20251213082550_consolidated_clean_schema.sql 2>/dev/null || true

# 4. Reset local migration state
npx supabase migration reset

# 5. Apply the consolidated migration
npx supabase db push --include-all

# 6. Verify everything works
psql $DATABASE_URL -f check_current_schema.sql
