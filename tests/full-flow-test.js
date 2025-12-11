#!/usr/bin/env node

/**
 * Full Flow Test - Complete End-to-End Testing
 *
 * Tests the entire audit flow from dispatcher to orchestrator
 * Reports on all components and identifies any failures
 */

import https from 'https';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables');
  console.error('   export SUPABASE_URL="https://zlrivxntdtewfagrbtry.supabase.co"');
  console.error('   export SUPABASE_ANON_KEY="your-anon-key"');
  process.exit(1);
}

const TEST_PREFLIGHT_ID = '8dea549f-17db-4b48-bfa9-6dfa5d5be853'; // From your error log

async function makeRequest(endpoint, data, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log(`🔗 ${SUPABASE_URL}/functions/v1/${endpoint}`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);

    const urlObj = new URL(`${SUPABASE_URL}/functions/v1/${endpoint}`);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Full-Flow-Test/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      console.log(`📡 Status: ${res.statusCode}`);

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          if (res.headers['content-type']?.includes('text/plain') ||
              res.headers['content-type']?.includes('text/event-stream')) {
            resolve({ statusCode: res.statusCode, body, headers: res.headers, description });
          } else {
            const parsed = JSON.parse(body);
            resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers, description });
          }
        } catch (e) {
          resolve({ statusCode: res.statusCode, body, headers: res.headers, description });
        }
      });
    });

    req.on('error', (err) => {
      console.log(`❌ Network Error: ${err.message}`);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 FULL FLOW TEST - SCAI Audit System');
  console.log('=====================================');
  console.log(`📋 Test Preflight ID: ${TEST_PREFLIGHT_ID}`);
  console.log(`🎯 Target: Universal Reasoning Layer (Orchestrator)`);
  console.log('');

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // ============================================================================
  // TEST 1: Environment Check
  // ============================================================================

  try {
    const result = await makeRequest('orchestrator', {
      preflightId: 'env-test',
      tier: 'starter'
    }, 'Environment Variables (Orchestrator)');

    if (result.statusCode === 500 && result.body?.error?.includes('Preflight not found')) {
      results.passed.push('✅ Environment variables accessible (GEMINI_API_KEY found)');
    } else if (result.statusCode === 500 && result.body?.error?.includes('GEMINI_API_KEY')) {
      results.failed.push('❌ GEMINI_API_KEY not configured in edge functions');
    } else {
      results.warnings.push(`⚠️ Unexpected environment check result: ${result.statusCode}`);
    }
  } catch (error) {
    results.failed.push(`❌ Environment check failed: ${error.message}`);
  }

  // ============================================================================
  // TEST 2: Audit Dispatcher (New Entry Point)
  // ============================================================================

  try {
    const result = await makeRequest('audit-dispatcher', {
      preflightId: TEST_PREFLIGHT_ID,
      tier: 'performance',
      userId: 'test-user-123'
    }, 'Audit Dispatcher (New Entry Point)');

    if (result.statusCode === 200) {
      results.passed.push('✅ Audit Dispatcher routing to orchestrator');

      if (result.body?._routing?.system === 'orchestrator') {
        results.passed.push('✅ Dispatcher correctly routing to NEW system');
      } else {
        results.warnings.push('⚠️ Dispatcher not routing to orchestrator as expected');
      }

    } else if (result.statusCode === 500 && result.body?.error?.includes('Orchestrator failed')) {
      results.failed.push('❌ Orchestrator execution failed (check orchestrator logs)');
    } else {
      results.failed.push(`❌ Dispatcher failed with status ${result.statusCode}: ${JSON.stringify(result.body)}`);
    }
  } catch (error) {
    results.failed.push(`❌ Dispatcher test failed: ${error.message}`);
  }

  // ============================================================================
  // TEST 3: Orchestrator Direct Call
  // ============================================================================

  try {
    const result = await makeRequest('orchestrator', {
      preflightId: TEST_PREFLIGHT_ID,
      tier: 'performance'
    }, 'Orchestrator Direct Call');

    if (result.statusCode === 200) {
      results.passed.push('✅ Orchestrator direct call successful');

      if (result.body?.success !== false) {
        results.passed.push('✅ Orchestrator returned successful result');
      } else {
        results.warnings.push('⚠️ Orchestrator returned success=false');
      }

    } else if (result.statusCode === 500) {
      if (result.body?.error?.includes('Preflight not found')) {
        results.warnings.push('⚠️ Preflight not found (need to create through UI)');
      } else {
        results.failed.push(`❌ Orchestrator failed: ${result.body?.error || 'Unknown error'}`);
      }
    } else {
      results.failed.push(`❌ Orchestrator unexpected status: ${result.statusCode}`);
    }
  } catch (error) {
    results.failed.push(`❌ Orchestrator direct test failed: ${error.message}`);
  }

  // ============================================================================
  // TEST 4: Legacy System (For Comparison)
  // ============================================================================

  try {
    const result = await makeRequest('audit-orchestrator', {
      preflightId: TEST_PREFLIGHT_ID,
      tier: 'performance',
      userId: 'test-user'
    }, 'Legacy Audit Orchestrator (Old System)');

    if (result.statusCode === 200) {
      results.passed.push('✅ Legacy system still functional');
    } else if (result.statusCode === 500 && result.body?.error?.includes('Preflight not found')) {
      results.warnings.push('⚠️ Legacy system also missing preflight (expected)');
    } else {
      results.warnings.push(`⚠️ Legacy system status: ${result.statusCode} (may be expected)`);
    }
  } catch (error) {
    results.warnings.push(`⚠️ Legacy system test failed: ${error.message} (may be expected)`);
  }

  // ============================================================================
  // TEST 5: Streaming Support
  // ============================================================================

  try {
    const result = await makeRequest('orchestrator', {
      preflightId: TEST_PREFLIGHT_ID,
      tier: 'performance',
      stream: true
    }, 'Orchestrator Streaming Support');

    if (result.statusCode === 200 && result.headers['content-type']?.includes('text/event-stream')) {
      results.passed.push('✅ Streaming response supported');
    } else if (result.statusCode === 200) {
      results.warnings.push('⚠️ Streaming requested but got JSON response (fallback working)');
    } else {
      results.warnings.push(`⚠️ Streaming test status: ${result.statusCode}`);
    }
  } catch (error) {
    results.warnings.push(`⚠️ Streaming test failed: ${error.message}`);
  }

  // ============================================================================
  // RESULTS SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));

  console.log(`\n✅ PASSED (${results.passed.length}):`);
  results.passed.forEach(test => console.log(`   ${test}`));

  if (results.warnings.length > 0) {
    console.log(`\n⚠️ WARNINGS (${results.warnings.length}):`);
    results.warnings.forEach(test => console.log(`   ${test}`));
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ FAILED (${results.failed.length}):`);
    results.failed.forEach(test => console.log(`   ${test}`));
  }

  console.log('\n' + '='.repeat(60));

  // Overall assessment
  if (results.failed.length === 0) {
    console.log('🎉 ALL TESTS PASSED - New flow is working!');
  } else if (results.failed.length === 1 && results.failed[0].includes('Preflight not found')) {
    console.log('🎯 SYSTEM READY - Just need real preflight data from UI');
  } else {
    console.log('🔧 ISSUES FOUND - Check Supabase Edge Functions logs');
    console.log('   Dashboard: https://supabase.com/dashboard/project/zlrivxntdtewfagrbtry/functions');
  }

  console.log('\n💡 Next Steps:');
  if (results.failed.some(f => f.includes('GEMINI_API_KEY'))) {
    console.log('   1. Set GEMINI_API_KEY in Supabase Edge Functions environment');
  }
  if (results.failed.some(f => f.includes('Preflight not found'))) {
    console.log('   1. Create preflight through UI dashboard');
    console.log('   2. Run this test again with real preflight ID');
  }
  console.log('   3. Check Supabase function logs for detailed error traces');

  return results;
}

runTests().catch(console.error);
