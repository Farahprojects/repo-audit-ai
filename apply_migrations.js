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

    // Count statements for logging
    const statementCount = sql.split(';').filter(stmt => stmt.trim().length > 0).length;
    console.log(`Executing migration with ${statementCount} statements...`);

    // Execute the entire migration file as one SQL batch
    // This eliminates N+1 network calls (was N calls, now 1 call per migration)
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error(`❌ Error executing migration:`, error);

      // If batch execution fails, try executing statements individually as fallback
      console.log('🔄 Falling back to individual statement execution...');
      await executeStatementsIndividually(sql);
    } else {
      console.log(`✅ Migration ${filePath} applied successfully (${statementCount} statements in 1 call)`);
    }
  } catch (error) {
    console.error(`❌ Failed to apply migration ${filePath}:`, error);
    throw error; // Re-throw to stop execution on migration failure
  }
}

async function executeStatementsIndividually(sql) {
  // Split SQL into individual statements as fallback
  const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

  for (const statement of statements) {
    if (statement.trim()) {
      console.log(`Executing: ${statement.trim().substring(0, 50)}...`);
      const { error } = await supabase.rpc('exec_sql', { sql: statement.trim() + ';' });

      if (error) {
        console.error(`Error executing statement:`, error);
        throw error; // Stop on first error in fallback mode
      }
    }
  }

  console.log(`✅ Executed ${statements.length} statements individually`);
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


