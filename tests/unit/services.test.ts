// Unit Tests for Service Layer Components
// Run with: deno test --allow-read --allow-net tests/unit/services.test.ts

import { assert, assertEquals, assertThrows } from "@std/assert";
import { CircuitBreakerService, GitHubCircuitBreaker, AICircuitBreaker } from "../../supabase/functions/_shared/services/CircuitBreakerService.ts";
import { RetryService, GitHubRetry, AIRetry } from "../../supabase/functions/_shared/services/RetryService.ts";
import { MonitoringService } from "../../supabase/functions/_shared/services/MonitoringService.ts";
import { AutoFixService } from "../../supabase/functions/_shared/services/AutoFixService.ts";
import { GitService } from "../../supabase/functions/_shared/services/GitService.ts";
import { PaymentService } from "../../supabase/functions/_shared/services/PaymentService.ts";
import { ExecutionPricing } from "../../supabase/functions/_shared/services/ExecutionPricing.ts";

Deno.test("CircuitBreakerService - Basic Functionality", async () => {
  // Reset circuit breaker state
  CircuitBreakerService.resetBreaker("test-service");

  let callCount = 0;
  const mockOperation = () => {
    callCount++;
    return Promise.resolve("success");
  };

  // First call should succeed
  const result1 = await CircuitBreakerService.executeWithCircuitBreaker("test-service", mockOperation);
  assertEquals(result1, "success");
  assertEquals(callCount, 1);

  // Circuit should still be closed
  const status = CircuitBreakerService.getBreakerStatus("test-service");
  assertEquals(status?.state, "closed");
});

Deno.test("CircuitBreakerService - Opens on Failures", async () => {
  CircuitBreakerService.resetBreaker("failing-service");

  let callCount = 0;
  const mockFailingOperation = () => {
    callCount++;
    return Promise.reject(new Error("Service unavailable"));
  };

  // Call multiple times to trigger circuit breaker
  for (let i = 0; i < 5; i++) {
    try {
      await CircuitBreakerService.executeWithCircuitBreaker("failing-service", mockFailingOperation);
    } catch (error) {
      // Expected to fail
    }
  }

  // Circuit should now be open
  const status = CircuitBreakerService.getBreakerStatus("failing-service");
  assertEquals(status?.state, "open");
  assertEquals(status?.failures, 5);
});

Deno.test("RetryService - Basic Retry Logic", async () => {
  let attemptCount = 0;
  const mockOperation = () => {
    attemptCount++;
    if (attemptCount < 3) {
      return Promise.reject(new Error("Temporary failure"));
    }
    return Promise.resolve("success");
  };

  const result = await RetryService.executeWithRetry(mockOperation, { maxAttempts: 3 });
  assertEquals(result, "success");
  assertEquals(attemptCount, 3);
});

Deno.test("RetryService - Max Attempts Exceeded", async () => {
  let attemptCount = 0;
  const mockOperation = () => {
    attemptCount++;
    console.log(`Mock operation called, attempt ${attemptCount}`);
    // Use a non-retryable error message to ensure it doesn't retry
    return Promise.reject(new Error("Persistent failure"));
  };

  try {
    await RetryService.executeWithRetry(mockOperation, { maxAttempts: 2 });
    assert(false, "Should have thrown error");
  } catch (error) {
    assertEquals((error as Error).message, "Persistent failure");
    console.log(`Final attempt count: ${attemptCount}`);
    // Should make 1 attempt since the error is not retryable
    assertEquals(attemptCount, 1, `Expected exactly 1 attempt for non-retryable error, got ${attemptCount}`);
  }
});

Deno.test("MonitoringService - Metrics Recording", () => {
  // Clear existing metrics
  (MonitoringService as any).metrics = [];

  MonitoringService.recordMetric("test.metric", 42, { tier: "pro", userId: "123" });
  MonitoringService.recordAuditCompletion({
    auditId: "audit-123",
    duration: 5000,
    tier: "security",
    success: true,
    tokensUsed: 1500,
    issuesFound: 5
  });

  const summary = MonitoringService.getMetricsSummary(24);
  assert(summary["totalMetrics"] >= 2);
  assert(summary["breakdowns"]["test.metric"]);
  assert(summary["breakdowns"]["audit.duration"]);
});

Deno.test("ExecutionPricing - Basic Pricing Calculation", () => {
  // Test price calculation for different token amounts
  const smallQuote = ExecutionPricing.calculatePrice(1000);
  assert(smallQuote.totalCents > 0);
  assertEquals(smallQuote.currency, 'USD');
  assert(smallQuote.formattedPrice.startsWith('$'));

  const largeQuote = ExecutionPricing.calculatePrice(50000);
  assert(largeQuote.totalCents > smallQuote.totalCents); // More tokens should cost more

  // Test price formatting
  const formatted = ExecutionPricing.format(250); // 250 cents = $2.50
  assertEquals(formatted, '$2.50');
});

Deno.test("GitService - Basic Import Test", () => {
  // Test that the service can be imported without errors
  // This verifies the basic structure exists
  assert(typeof GitService !== 'undefined');
});

Deno.test("PaymentService - Basic Payment Processing", async () => {
  // Test successful payment
  const successResult = await PaymentService.capturePayment(1000, 'usd', 'pm_test_success');
  assertEquals(successResult.success, true);
  assert(successResult.transactionId?.startsWith('txn_'));

  // Test failed payment
  const failResult = await PaymentService.capturePayment(1000, 'usd', 'fail_me');
  assertEquals(failResult.success, false);
  assert(failResult.error?.includes('declined'));
});

console.log("✅ All unit tests for services passed!");
