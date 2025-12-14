#!/bin/bash
# Apply owner_repo migration directly to remote database

echo "Applying owner_repo migration to remote database..."

# Get the Supabase project ref from config
PROJECT_REF=$(grep 'project_id' supabase/.temp/project-ref 2>/dev/null || grep 'project_id' supabase/config.toml | cut -d'"' -f2)

if [ -z "$PROJECT_REF" ]; then
    echo "Error: Could not find project ref"
    exit 1
fi

# Apply the migration SQL
supabase db execute --file supabase/migrations/20251214100000_add_owner_repo_to_repos.sql --linked

echo "Migration applied successfully!"
echo "Marking migration as applied in history..."

# Mark as applied in migration history
supabase migration repair --status applied 20251214100000 --linked

echo "Done!"
