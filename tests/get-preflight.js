#!/usr/bin/env node

/**
 * Get Available Preflight IDs for Testing
 *
 * Queries the database for available preflights to use with orchestrator testing.
 */

import https from 'https';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables. Run:');
  console.error('   export SUPABASE_URL="https://zlrivxntdtewfagrbtry.supabase.co"');
  console.error('   export SUPABASE_ANON_KEY="your-anon-key"');
  process.exit(1);
}

async function queryPreflights() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/preflights`);
    url.searchParams.set('select', 'id,repo_url,created_at,file_count,is_private,stats');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '10');

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('🔍 Fetching available preflights for testing...\n');

  try {
    const result = await queryPreflights();

    if (result.statusCode !== 200) {
      console.error('❌ Query failed:', result.statusCode);
      console.error('Response:', result.body || result.data);
      process.exit(1);
    }

    const preflights = result.data;

    if (!preflights || preflights.length === 0) {
      console.log('📭 No preflights found in the last 30 days.');
      console.log('');
      console.log('💡 To create a preflight for testing:');
      console.log('1. Go to your app dashboard');
      console.log('2. Connect a GitHub repository');
      console.log('3. Run a preflight scan');
      console.log('4. Then run this script again');
      return;
    }

    console.log('📋 Available Preflights:');
    console.log('='.repeat(80));

    preflights.forEach((p, i) => {
      console.log(`${i + 1}. ID: ${p.id}`);
      console.log(`   Repo: ${p.repo_url}`);
      console.log(`   Created: ${new Date(p.created_at).toLocaleString()}`);
      console.log(`   Files: ${p.file_count}, Language: ${p.language || 'Unknown'}`);
      console.log(`   Private: ${p.is_private ? 'Yes' : 'No'}`);
      console.log('');
    });

    console.log('🚀 To test the orchestrator with one of these preflights:');
    console.log(`   node tests/orchestrator-test.js ${preflights[0].id} security`);
    console.log('');
    console.log('📊 Test different tiers: starter, security, performance, comprehensive');

  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
}

main();
