# SCAI Observability & Monitoring Guide

This document explains how to use SCAI's comprehensive observability system for full runtime visibility and error tracking.

## 🚀 Overview

SCAI includes enterprise-grade observability features to provide complete visibility into system performance, errors, and runtime behavior. The system captures detailed metrics, logs, and traces to help you monitor and debug your application.

## 📊 Key Components

### 1. LoggerService
**Location:** `supabase/functions/_shared/services/LoggerService.ts`

Structured logging with correlation IDs, request tracing, and contextual information.

```typescript
import { LoggerService, RequestTracer } from '../_shared/services/LoggerService.ts';

// Basic logging
LoggerService.info("User logged in", { userId: "123", component: "Auth" });
LoggerService.error("Database connection failed", error, { component: "Database" });

// Request tracing
const tracer = LoggerService.startRequest("audit-operation", { userId: "123" });
tracer.checkpoint("validation-complete");
tracer.end(true, { result: "success" });
```

### 2. ErrorTrackingService
**Location:** `supabase/functions/_shared/services/ErrorTrackingService.ts`

Advanced error capture with breadcrumbs, grouping, and detailed context.

```typescript
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts';

// Capture errors
const errorId = ErrorTrackingService.captureError(
  new Error("Payment failed"),
  { userId: "123", amount: 99.99 },
  "high"
);

// Add breadcrumbs for debugging
ErrorTrackingService.addBreadcrumb("Payment form submitted", "payment", "info");
ErrorTrackingService.addBreadcrumb("Stripe API called", "payment", "info");
```

### 3. RuntimeMonitoringService
**Location:** `supabase/functions/_shared/services/RuntimeMonitoringService.ts`

Real-time performance monitoring with health checks and alerting.

```typescript
import { RuntimeMonitoringService } from '../_shared/services/RuntimeMonitoringService.ts';

// Track requests
const requestId = RuntimeMonitoringService.startRequest();
RuntimeMonitoringService.endRequest(requestId, duration, success);

// Get health status
const health = await RuntimeMonitoringService.getHealthStatus();
console.log(`System status: ${health.status}`);

// Get performance metrics
const metrics = await RuntimeMonitoringService.collectMetrics();
console.log(`Memory usage: ${metrics.memory.heapUsed} bytes`);
```

## 🔍 Observability API

Access all monitoring data via the observability endpoint:

```
GET /functions/v1/observability?endpoint={type}
```

### Available Endpoints

#### Health Check
```
GET /functions/v1/observability?endpoint=health
```
Returns system health status and detailed checks.

#### Performance Metrics
```
GET /functions/v1/observability?endpoint=metrics&limit=100
```
Returns performance metrics history.

#### Error Reports
```
GET /functions/v1/observability?endpoint=errors
```
Returns error statistics and recent errors.

#### System Logs
```
GET /functions/v1/observability?endpoint=logs&limit=50&level=ERROR
```
Returns recent logs, optionally filtered by level.

#### Active Alerts
```
GET /functions/v1/observability?endpoint=alerts&active=true
```
Returns current active alerts.

#### Request Tracing
```
GET /functions/v1/observability?endpoint=correlation&id={correlationId}
```
Returns all logs for a specific request.

#### Dashboard Data
```
GET /functions/v1/observability?endpoint=dashboard
```
Returns comprehensive dashboard data.

### Export Formats

All endpoints support CSV export:
```
GET /functions/v1/observability?endpoint=logs&format=csv
```

## 📈 Monitoring Dashboard

### Real-time Metrics
- **Memory Usage:** Heap usage, external memory, RSS
- **Request Performance:** Active requests, response times, error rates
- **Database:** Connection count, query performance
- **CPU Usage:** Load averages and usage percentages

### Health Checks
- **Memory:** Alerts when >75% heap usage
- **Error Rate:** Alerts when >5% error rate
- **Database:** Connection and query performance
- **External Services:** API connectivity status

### Alerting System
- **Automatic Alerts:** Generated for performance issues
- **Severity Levels:** low, medium, high, critical
- **Resolution Tracking:** Mark alerts as resolved
- **Historical Data:** Alert history and trends

## 🔧 Integration Guide

### Adding Observability to Edge Functions

```typescript
import { LoggerService, RequestTracer } from '../_shared/services/LoggerService.ts';
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts';
import { RuntimeMonitoringService, withPerformanceMonitoring } from '../_shared/services/RuntimeMonitoringService.ts';

// Wrap your function with performance monitoring
serve(withPerformanceMonitoring(async (req) => {
  const tracer = LoggerService.startRequest('my-operation', {
    component: 'MyFunction',
    userId: '123'
  });

  try {
    // Add breadcrumbs
    ErrorTrackingService.addBreadcrumb('Starting operation', 'process', 'info');

    // Your function logic here
    const result = await performOperation();

    tracer.checkpoint('operation-complete', { resultSize: result.length });

    LoggerService.info('Operation completed successfully', {
      component: 'MyFunction',
      resultCount: result.length
    });

    tracer.end(true, { success: true });
    return new Response(JSON.stringify(result));

  } catch (error) {
    // Error tracking
    ErrorTrackingService.captureError(error, {
      component: 'MyFunction',
      operation: 'performOperation'
    }, 'high');

    LoggerService.error('Operation failed', error, {
      component: 'MyFunction'
    });

    tracer.end(false, { error: error.message });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}, 'my-operation'));
```

### Global Error Handling

```typescript
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts';

// Setup global error tracking in your main function
ErrorTrackingService.setupGlobalErrorHandler();

// Your application code here
```

## 🎯 Best Practices

### Logging Levels
- **DEBUG:** Detailed debugging information
- **INFO:** General operational messages
- **WARN:** Warning conditions that don't stop operation
- **ERROR:** Error conditions that affect operation
- **CRITICAL:** Severe errors requiring immediate attention

### Correlation IDs
Always include correlation IDs for request tracing:
```typescript
const tracer = LoggerService.startRequest('operation', { userId: '123' });
const correlationId = tracer.getCorrelationId();

// Pass correlationId to child operations
childFunction(correlationId);
```

### Error Context
Provide rich context when capturing errors:
```typescript
ErrorTrackingService.captureError(error, {
  userId: '123',
  operation: 'payment',
  amount: 99.99,
  paymentMethod: 'card',
  attempt: 2
}, 'medium');
```

### Performance Monitoring
Track key performance indicators:
```typescript
const startTime = performance.now();
// ... operation ...
const duration = performance.now() - startTime;

LoggerService.info('Operation completed', {
  duration: Math.round(duration * 100) / 100,
  success: true
});
```

## 📊 Metrics & KPIs

### System Health KPIs
- **Uptime:** >99.9% availability
- **Error Rate:** <5% overall
- **Memory Usage:** <75% heap utilization
- **Response Time:** <500ms average

### Business KPIs
- **Audit Completion Rate:** >95%
- **User Satisfaction:** >4.5/5 rating
- **Auto-fix Success Rate:** >80%

## 🚨 Alert Configuration

### Automatic Alerts
- **Critical:** Memory >90%, error rate >10%, system down
- **High:** Memory >75%, error rate >5%, slow responses
- **Medium:** Memory >50%, error rate >2%
- **Low:** Performance degradation warnings

### Alert Channels
Configure alerts to notify:
- **Slack/Discord:** Real-time team notifications
- **Email:** Daily/weekly summaries
- **PagerDuty/Opsgenie:** Critical alerts
- **Monitoring Dashboards:** Visual indicators

## 🔍 Troubleshooting

### Common Issues

#### High Memory Usage
1. Check for memory leaks in edge functions
2. Monitor request patterns and spikes
3. Review database query efficiency

#### High Error Rates
1. Check error logs via observability API
2. Look for correlation IDs in error traces
3. Review recent deployments and changes

#### Slow Performance
1. Check performance metrics in observability API
2. Review request tracing for bottlenecks
3. Monitor database query performance

### Debugging with Correlation IDs

```bash
# Get all logs for a specific request
curl "https://your-project.supabase.co/functions/v1/observability?endpoint=correlation&id=corr-123456"

# Get recent errors
curl "https://your-project.supabase.co/functions/v1/observability?endpoint=errors"

# Get system health
curl "https://your-project.supabase.co/functions/v1/observability?endpoint=health"
```

## 📈 Scaling & Performance

### Monitoring at Scale
- **Metrics Aggregation:** Automatic aggregation of high-volume metrics
- **Sampling:** Smart sampling for high-frequency operations
- **Retention:** Configurable retention policies for logs and metrics
- **Archiving:** Automatic archiving of historical data

### Alert Management
- **Alert Fatigue Prevention:** Intelligent alert grouping and throttling
- **Escalation Policies:** Automatic escalation for unresolved alerts
- **Maintenance Mode:** Suppress alerts during planned maintenance

This observability system provides complete visibility into your SCAI application, enabling proactive monitoring, rapid debugging, and reliable operation at any scale.
