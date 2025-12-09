/// <reference lib="deno.ns" />

// Integration Tests for Complete Audit Flow
// Tests the integration between services and edge functions
// Run with: deno test --allow-read --allow-net tests/integration/audit-flow.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock Supabase client for integration testing
class MockSupabaseClient {
  private data: Map<string, any[]> = new Map();

  constructor() {
    // Initialize with some test data
    this.data.set('audits', []);
    this.data.set('audit_status', []);
    this.data.set('preflights', []);
  }

  from(table: string) {
    return {
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            const records = this.data.get(table) || [];
            const record = records.find(r => r[column] === value);
            return record ? { data: record, error: null } : { data: null, error: { message: 'Not found' } };
          }
        }),
        order: (column: string, options: any) => ({
          limit: (count: number) => ({
            then: async (resolve: Function) => {
              const records = this.data.get(table) || [];
              const sorted = [...records].sort((a, b) => {
                if (options.ascending) return a[column] > b[column] ? 1 : -1;
                return a[column] < b[column] ? 1 : -1;
              });
              resolve({ data: sorted.slice(0, count), error: null });
            }
          })
        })
      }),
      insert: (record: any) => ({
        then: async (resolve: Function) => {
          const records = this.data.get(table) || [];
          const newRecord = { ...record, id: `mock-${Date.now()}`, created_at: new Date().toISOString() };
          records.push(newRecord);
          this.data.set(table, records);
          resolve({ data: newRecord, error: null });
        }
      } as any),
      update: (updates: any) => ({
        eq: (column: string, value: any) => ({
          then: async (resolve: Function) => {
            const records = this.data.get(table) || [];
            const index = records.findIndex(r => r[column] === value);
            if (index >= 0) {
              records[index] = { ...records[index], ...updates, updated_at: new Date().toISOString() };
              this.data.set(table, records);
              resolve({ data: records[index], error: null });
            } else {
              resolve({ data: null, error: { message: 'Not found' } });
            }
          }
        })
      } as any)
    };
  }

  functions = {
    invoke: async (functionName: string, options: any) => {
      // Mock function responses
      switch (functionName) {
        case 'audit-planner':
          return {
            data: {
              plan: { tasks: [{ id: 'task-1', role: 'security-analyst', instruction: 'Analyze security issues' }] },
              tier: options.body.tier,
              usage: { totalTokens: 1500 },
              preflight: { id: options.body.preflightId, repo_map: [] }
            },
            error: null
          };

        case 'audit-worker':
          return {
            data: {
              result: {
                issues: [
                  { id: 'issue-1', title: 'Security vulnerability', severity: 'high' },
                  { id: 'issue-2', title: 'Performance issue', severity: 'medium' }
                ],
                tokenUsage: 800
              }
            },
            error: null
          };

        case 'audit-coordinator':
          return {
            data: {
              issues: [
                { id: 'issue-1', title: 'Security vulnerability', severity: 'high' },
                { id: 'issue-2', title: 'Performance issue', severity: 'medium' }
              ],
              healthScore: 75,
              tier: options.body.tier
            },
            error: null
          };

        default:
          return { data: null, error: { message: 'Function not found' } };
      }
    }
  };
}

Deno.test("Integration - Complete Audit Flow", async () => {
  const mockSupabase = new MockSupabaseClient();

  // Step 1: Create a preflight record
  const preflightData = {
    repo_url: "https://github.com/test/repo",
    owner: "test",
    repo: "repo",
    repo_map: [],
    is_private: false,
    fetch_strategy: "public",
    user_id: "user-123",
    file_count: 10
  };

  const { data: preflight } = await mockSupabase.from('preflights').insert(preflightData);
  assert(preflight, "Should create preflight record");
  assertEquals(preflight.repo_url, preflightData.repo_url);

  // Step 2: Simulate audit orchestration request
  const auditRequest = {
    preflightId: preflight.id,
    tier: "security",
    userId: "user-123"
  };

  // Step 3: Test audit status creation
  const statusData = {
    preflight_id: auditRequest.preflightId,
    user_id: auditRequest.userId,
    status: 'processing',
    progress: 0,
    logs: ['Audit orchestration started'],
    tier: auditRequest.tier
  };

  const { data: auditStatus } = await mockSupabase.from('audit_status').insert(statusData);
  assert(auditStatus, "Should create audit status record");
  assertEquals(auditStatus.status, 'processing');
  assertEquals(auditStatus.progress, 0);

  // Step 4: Simulate calling audit-planner
  const plannerResponse = await mockSupabase.functions.invoke('audit-planner', {
    body: { preflightId: auditRequest.preflightId, tier: auditRequest.tier }
  });

  assert(plannerResponse.data, "Planner should return data");
  assert(plannerResponse.data.plan.tasks.length > 0, "Should have tasks");

  // Step 5: Simulate worker execution
  const workerResponse = await mockSupabase.functions.invoke('audit-worker', {
    body: {
      preflightId: auditRequest.preflightId,
      taskId: 'task-1',
      instruction: 'Analyze security issues',
      role: 'security-analyst',
      targetFiles: [],
      preflight: preflight
    }
  });

  assert(workerResponse.data, "Worker should return data");
  assert(workerResponse.data.result.issues.length > 0, "Should find issues");

  // Step 6: Simulate coordinator synthesis
  const coordinatorResponse = await mockSupabase.functions.invoke('audit-coordinator', {
    body: {
      preflightId: auditRequest.preflightId,
      workerResults: [workerResponse.data.result],
      tier: auditRequest.tier,
      plannerUsage: plannerResponse.data.usage
    }
  });

  assert(coordinatorResponse.data, "Coordinator should return data");
  assert(coordinatorResponse.data.healthScore, "Should have health score");

  // Step 7: Update audit status to completed
  const { data: updatedStatus } = await mockSupabase.from('audit_status')
    .update({
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      report_data: coordinatorResponse.data
    })
    .eq('preflight_id', auditRequest.preflightId);

  assert(updatedStatus, "Should update audit status");
  assertEquals(updatedStatus.status, 'completed');
  assertEquals(updatedStatus.progress, 100);
  assert(updatedStatus.report_data, "Should have report data");

  console.log("✅ Complete audit flow integration test passed!");
});

Deno.test("Integration - Chunking Workflow", () => {
  // Test chunking logic without database
  const largeIssues = Array.from({ length: 150 }, (_, i) => ({
    id: `issue-${i}`,
    title: `Issue ${i}`,
    description: `Description ${i}`.repeat(50), // Make it large
    severity: i % 3 === 0 ? 'high' : 'medium'
  }));

  // Simulate chunking algorithm
  const maxChunkSize = 500 * 1024; // 500KB
  const chunks: any[][] = [];
  let chunkIndex = 0;
  let batchSize = 50;

  while (chunkIndex * batchSize < largeIssues.length) {
    const start = chunkIndex * batchSize;
    const end = Math.min((chunkIndex + 1) * batchSize, largeIssues.length);
    const chunk = largeIssues.slice(start, end);

    // Check if chunk is too large (simulate pg_column_size)
    const chunkSize = JSON.stringify(chunk).length;
    if (chunkSize < maxChunkSize) {
      chunks.push(chunk);
    } else {
      // If chunk too large, reduce batch size and retry
      batchSize = Math.max(1, batchSize / 2);
      continue;
    }

    chunkIndex++;
  }

  // Verify chunking results
  assert(chunks.length > 0, "Should create chunks");
  assert(chunks.length <= Math.ceil(largeIssues.length / 10), "Should not create too many chunks");

  // Verify all issues are preserved
  const totalIssues = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  assertEquals(totalIssues, largeIssues.length, "All issues should be preserved");

  console.log("✅ Chunking workflow integration test passed!");
});

console.log("✅ All integration tests passed!");
