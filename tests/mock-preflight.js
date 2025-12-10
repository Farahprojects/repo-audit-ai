#!/usr/bin/env node

/**
 * Create Mock Preflight for Orchestrator Testing
 *
 * Creates a test preflight record in the database for isolated orchestrator testing.
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

async function createMockPreflight() {
  const mockPreflight = {
    repo_url: "https://github.com/octocat/Hello-World",
    owner: "octocat",
    repo: "Hello-World",
    default_branch: "main",
    repo_map: [
      {
        path: "README.md",
        type: "file",
        size: 1024,
        language: "markdown"
      },
      {
        path: "src/index.js",
        type: "file",
        size: 512,
        language: "javascript"
      },
      {
        path: "package.json",
        type: "file",
        size: 256,
        language: "json"
      }
    ],
    stats: {
      files: 3,
      tokens: "1.2K",
      size: "2KB",
      language: "JavaScript",
      languagePercent: 33.3,
      defaultBranch: "main",
      isPrivate: false
    },
    is_private: false,
    fetch_strategy: "public",
    token_valid: true,
    file_count: 3,
    user_id: "550e8400-e29b-41d4-a716-446655440000" // Test UUID
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(mockPreflight);

    const url = new URL(`${SUPABASE_URL}/rest/v1/preflights`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Prefer': 'return=representation'
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
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('🧪 Creating mock preflight for orchestrator testing...\n');

  try {
    const result = await createMockPreflight();

    if (result.statusCode === 201 || result.statusCode === 200) {
      const preflight = result.data[0] || result.data;
      console.log('✅ Mock preflight created successfully!');
      console.log('📋 Preflight Details:');
      console.log(`   ID: ${preflight.id}`);
      console.log(`   Repo: ${preflight.repo_url}`);
      console.log(`   Files: ${preflight.file_count}`);
      console.log(`   Private: ${preflight.is_private}`);
      console.log('');

      console.log('🚀 Ready to test the orchestrator!');
      console.log(`   node tests/orchestrator-test.js ${preflight.id} security`);
      console.log('');
      console.log('💡 Test different audit types:');
      console.log(`   node tests/orchestrator-test.js ${preflight.id} starter`);
      console.log(`   node tests/orchestrator-test.js ${preflight.id} performance`);
      console.log(`   node tests/orchestrator-test.js ${preflight.id} comprehensive`);

    } else {
      console.error('❌ Failed to create mock preflight:');
      console.error(`Status: ${result.statusCode}`);
      console.error('Response:', result.data || result.body);

      if (result.statusCode === 401) {
        console.log('');
        console.log('🔐 This might be due to RLS (Row Level Security) policies.');
        console.log('   The mock user_id might not match your authenticated user.');
        console.log('   Try creating a real preflight through the UI instead.');
      }
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
}

main();
