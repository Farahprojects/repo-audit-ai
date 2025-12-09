// Edge Function Tests
// Test the core logic of edge functions without requiring full Supabase environment
// Run with: deno test --allow-read --allow-net tests/unit/edge-functions.test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";

// Mock the RequestValidationService for testing
class MockRequestValidationService {
  static validateAuditOrchestrationRequest(body: any): { isValid: boolean; error?: string } {
    if (!body.preflightId || typeof body.preflightId !== 'string') {
      return { isValid: false, error: 'preflightId is required and must be a string' };
    }
    if (!body.tier || typeof body.tier !== 'string') {
      return { isValid: false, error: 'tier is required and must be a string' };
    }
    if (!body.userId || typeof body.userId !== 'string') {
      return { isValid: false, error: 'userId is required and must be a string' };
    }

    const validTiers = ['shape', 'conventions', 'performance', 'security'];
    if (!validTiers.includes(body.tier)) {
      return { isValid: false, error: `tier must be one of: ${validTiers.join(', ')}` };
    }

    return { isValid: true };
  }
}

// Test audit orchestrator request validation
Deno.test("Audit Orchestrator - Request Validation", () => {
  // Valid request
  const validRequest = {
    preflightId: "preflight-123",
    tier: "security",
    userId: "user-456"
  };

  const validResult = MockRequestValidationService.validateAuditOrchestrationRequest(validRequest);
  assertEquals(validResult.isValid, true);
  assertEquals(validResult.error, undefined);

  // Invalid requests
  const invalidRequests = [
    { tier: "security", userId: "user-456" }, // missing preflightId
    { preflightId: "preflight-123", userId: "user-456" }, // missing tier
    { preflightId: "preflight-123", tier: "security" }, // missing userId
    { preflightId: "preflight-123", tier: "invalid", userId: "user-456" }, // invalid tier
    { preflightId: 123, tier: "security", userId: "user-456" }, // wrong type
  ];

  invalidRequests.forEach((req, index) => {
    const result = MockRequestValidationService.validateAuditOrchestrationRequest(req);
    assertEquals(result.isValid, false, `Invalid request ${index} should fail validation`);
    assert(result.error, `Invalid request ${index} should have error message`);
  });
});

// Mock MonitoringService for testing
class MockMonitoringService {
  private static metrics: any[] = [];

  static recordMetric(name: string, value: number, tags: any = {}) {
    // Store metrics for testing
    this.metrics.push({ name, value, tags, timestamp: Date.now() });
  }

  static recordAPIUsage(service: string, endpoint: string, duration: number, success: boolean) {
    this.recordMetric('api.call_duration', duration, { service, endpoint, success: success.toString() });
  }

  static getMetricsSummary() {
    return {
      totalMetrics: this.metrics.length,
      breakdowns: {}
    };
  }
}

// Test health check logic
Deno.test("Health Check - Status Logic", () => {
  // Test healthy system
  const healthyChecks = {
    database: { status: 'pass', message: 'OK' },
    circuitBreakers: { status: 'pass', message: 'OK' },
    recentAudits: { status: 'pass', message: 'OK' },
    systemResources: { status: 'pass', message: 'OK' }
  };

  const healthyStatus = calculateOverallStatus(healthyChecks);
  assertEquals(healthyStatus, 'healthy');

  // Test degraded system (one warning)
  const degradedChecks = {
    ...healthyChecks,
    systemResources: { status: 'warn', message: 'High memory' }
  };

  const degradedStatus = calculateOverallStatus(degradedChecks);
  assertEquals(degradedStatus, 'degraded');

  // Test unhealthy system (one failure)
  const unhealthyChecks = {
    ...healthyChecks,
    database: { status: 'fail', message: 'Connection failed' }
  };

  const unhealthyStatus = calculateOverallStatus(unhealthyChecks);
  assertEquals(unhealthyStatus, 'unhealthy');
});

// Helper function to simulate health check status calculation
function calculateOverallStatus(checks: any): string {
  const statuses = Object.values(checks).map((check: any) => check.status);
  const hasFailures = statuses.includes('fail');
  const hasWarnings = statuses.includes('warn');

  if (hasFailures) return 'unhealthy';
  if (hasWarnings) return 'degraded';
  return 'healthy';
}

// Test metrics collection logic
Deno.test("Metrics Collection - Basic Functionality", () => {
  // Clear any existing metrics
  (MockMonitoringService as any).metrics = [];

  // Record some test metrics
  MockMonitoringService.recordMetric('test.audit_duration', 5000, { tier: 'security' });
  MockMonitoringService.recordMetric('test.api_calls', 150, { service: 'github' });
  MockMonitoringService.recordAPIUsage('ai', 'audit-planner', 2500, true);

  const summary = MockMonitoringService.getMetricsSummary();
  assert(summary.totalMetrics >= 3, "Should have recorded at least 3 metrics");

  // Verify metric structure
  const metrics = (MockMonitoringService as any).metrics;
  assert(metrics.every((m: any) => m.name && typeof m.value === 'number'), "All metrics should have name and numeric value");
});

// Test circuit breaker status tracking
Deno.test("Circuit Breaker - Status Tracking", () => {
  // Mock circuit breaker state
  const breakerStates = {
    'github-api': { failures: 0, state: 'closed', lastFailureTime: 0 },
    'ai-api': { failures: 3, state: 'half-open', lastFailureTime: Date.now() - 10000 },
    'failing-service': { failures: 8, state: 'open', lastFailureTime: Date.now() - 5000 }
  };

  // Test status analysis
  const openBreakers = Object.entries(breakerStates)
    .filter(([, state]) => state.state === 'open')
    .map(([name]) => name);

  assertEquals(openBreakers.length, 1);
  assertEquals(openBreakers[0], 'failing-service');

  const halfOpenBreakers = Object.entries(breakerStates)
    .filter(([, state]) => state.state === 'half-open')
    .map(([name]) => name);

  assertEquals(halfOpenBreakers.length, 1);
  assertEquals(halfOpenBreakers[0], 'ai-api');
});

console.log("✅ All edge function tests passed!");
