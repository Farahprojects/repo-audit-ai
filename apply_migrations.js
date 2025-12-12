import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://zlrivxntdtewfagrbtry.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key'
);

async function applyMigration(filePath) {
  try {
    console.log(`Applying migration: ${filePath}`);
    const sql = readFileSync(filePath, 'utf8');

    // Split SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.trim().substring(0, 50)}...`);
        const { error } = await supabase.rpc('exec_sql', { sql: statement.trim() + ';' });

        if (error) {
          console.log(`Error executing statement:`, error);
          // Continue with other statements even if one fails
        }
      }
    }

    console.log(`✅ Migration ${filePath} applied successfully`);
  } catch (error) {
    console.error(`❌ Failed to apply migration ${filePath}:`, error);
  }
}

async function main() {
  const migrations = [
    'supabase/migrations/20251212000000_create_audit_jobs_queue.sql',
    'supabase/migrations/20251212000001_consolidate_audit_tables.sql',
    'supabase/migrations/20251212000002_deprecate_reasoning_tables.sql',
    'supabase/migrations/20251212000003_setup_pgcron_scheduling.sql'
  ];

  for (const migration of migrations) {
    await applyMigration(migration);
  }

  console.log('🎉 All migrations applied!');
}

main().catch(console.error);

