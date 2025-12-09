// Observability Services Test
// Test the logging, error tracking, and monitoring services
// Run with: deno test --allow-read --allow-net tests/observability.test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";
import { LoggerService, RequestTracer } from "../supabase/functions/_shared/services/LoggerService.ts";
import { ErrorTrackingService } from "../supabase/functions/_shared/services/ErrorTrackingService.ts";
import { RuntimeMonitoringService } from "../supabase/functions/_shared/services/RuntimeMonitoringService.ts";

Deno.test("LoggerService - Basic Logging", () => {
  // Clear any existing logs
  (LoggerService as any).logs = [];

  LoggerService.info("Test info message", { component: "Test", userId: "123" });
  LoggerService.warn("Test warning", { component: "Test" });
  LoggerService.error("Test error", new Error("Test error details"), { component: "Test" });

  const logs = LoggerService.getRecentLogs(10);
  assert(logs.length >= 3);

  const infoLog = logs.find(log => log.message === "Test info message");
  assert(infoLog);
  assertEquals(infoLog.level, "INFO");
  assertEquals(infoLog.context.component, "Test");
});

Deno.test("LoggerService - Request Tracing", async () => {
  const tracer = LoggerService.startRequest("test-operation", {
    component: "TestTracer",
    userId: "123"
  });

  tracer.checkpoint("step-1", { progress: 25 });
  tracer.checkpoint("step-2", { progress: 50 });

  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 10));

  tracer.end(true, { result: "success" });

  const correlationId = tracer.getCorrelationId();
  const logs = LoggerService.getLogsByCorrelation(correlationId);

  assert(logs.length >= 3); // Start, checkpoints, end
  assert(logs.some(log => log.message.includes("Started test-operation")));
  assert(logs.some(log => log.message.includes("Completed test-operation")));
});

Deno.test("ErrorTrackingService - Error Capture", () => {
  // Clear existing errors
  (ErrorTrackingService as any).errors = [];

  // Mock environment variable access for testing
  const originalGetEnv = Deno.env.get;
  Deno.env.get = (key: string) => key === 'ENVIRONMENT' ? 'test' : originalGetEnv(key);

  try {
    const errorId = ErrorTrackingService.captureError(
      new Error("Test error"),
      { component: "Test", userId: "123" },
      "medium"
    );

    assert(errorId);
    assert(errorId.startsWith("err-"));

    const errors = ErrorTrackingService.getErrorReports(10);
    assertEquals(errors.length, 1);
    assertEquals(errors[0].error.message, "Test error");
    assertEquals(errors[0].severity, "medium");
  } finally {
    // Restore original env access
    Deno.env.get = originalGetEnv;
  }
});

Deno.test("ErrorTrackingService - Breadcrumbs", () => {
  // Clear breadcrumbs
  (ErrorTrackingService as any).breadcrumbs = [];

  ErrorTrackingService.addBreadcrumb("User logged in", "auth", "info", { userId: "123" });
  ErrorTrackingService.addBreadcrumb("File uploaded", "upload", "info", { fileSize: 1024 });

  const breadcrumbs = ErrorTrackingService.getBreadcrumbs(10);
  assertEquals(breadcrumbs.length, 2);
  assertEquals(breadcrumbs[0].message, "User logged in");
  assertEquals(breadcrumbs[1].message, "File uploaded");
});

Deno.test("RuntimeMonitoringService - Metrics Collection", async () => {
  // Reset monitoring state
  RuntimeMonitoringService.reset();

  // Start a request
  const requestId = RuntimeMonitoringService.startRequest();

  // Simulate request completion
  RuntimeMonitoringService.endRequest(requestId, 150, true);

  // Collect metrics
  const metrics = await RuntimeMonitoringService.collectMetrics();

  assert(metrics.timestamp);
  assert(metrics.memory);
  assert(metrics.requests);
  assertEquals(metrics.requests.total, 1);
  assertEquals(metrics.requests.active, 0);
});

Deno.test("RuntimeMonitoringService - Health Checks", async () => {
  const health = await RuntimeMonitoringService.getHealthStatus();

  assert(health.status);
  assert(health.uptime >= 0);
  assert(health.lastHealthCheck);
  assert(health.checks.memory);
  assert(health.checks.cpu);
  assert(health.checks.database);
  assert(health.checks.externalServices);
  assert(health.checks.errorRate);

  // Status should be one of the expected values
  assert(["healthy", "degraded", "unhealthy"].includes(health.status));
});

Deno.test("RuntimeMonitoringService - Alert System", async () => {
  RuntimeMonitoringService.reset();

  // Simulate high error rate by ending multiple requests as failures
  for (let i = 0; i < 15; i++) {
    const requestId = RuntimeMonitoringService.startRequest();
    RuntimeMonitoringService.endRequest(requestId, 100, false); // All failures
  }

  // Collect metrics (this should trigger alerts)
  await RuntimeMonitoringService.collectMetrics();

  // Check for alerts
  const alerts = RuntimeMonitoringService.getAlerts(10);
  const errorRateAlerts = alerts.filter(a => a.type === 'error_rate');

  // Should have generated an alert for high error rate
  assert(errorRateAlerts.length > 0);
  assert(errorRateAlerts[0].severity === 'high' || errorRateAlerts[0].severity === 'critical');
});

console.log("✅ All observability tests passed!");
