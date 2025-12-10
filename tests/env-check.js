#!/usr/bin/env node

/**
 * Environment Variable Check for Edge Functions
 *
 * Tests if environment variables are properly set in Supabase Edge Functions
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

async function testEnvCheck() {
  console.log('🧪 Testing Environment Variables in Edge Functions...\n');

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'User-Agent': 'Env-Test/1.0'
      },
      body: JSON.stringify({
        preflightId: 'test-env-check',
        tier: 'starter'
      })
    });

    console.log(`📡 Response Status: ${response.status}`);

    if (response.status === 200) {
      console.log('✅ Environment variables are working!');
      const data = await response.json();
      console.log('📄 Response:', data);
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText);

      if (response.status === 500) {
        console.log('\n🔍 Check Supabase Edge Functions logs for environment variable details');
        console.log('   Go to: https://supabase.com/dashboard/project/zlrivxntdtewfagrbtry/functions/orchestrator');
      }
    }

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testEnvCheck();
