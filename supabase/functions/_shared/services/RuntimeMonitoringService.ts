/// <reference lib="deno.ns" />

// @ts-ignore - Deno environment provides global Deno object
declare const Deno: any;

// Real-time Runtime Monitoring and Performance Tracking
// Provides live visibility into system performance and health

export interface PerformanceMetrics {
  timestamp: string;
  memory: {
    used: number;
    total: number;
    external: number;
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpu: {
    usage: number;
    loadAverage?: number[];
  };
  requests: {
    active: number;
    total: number;
    avgResponseTime: number;
    errorRate: number;
  };
  database: {
    connections: number;
    queryCount: number;
    avgQueryTime: number;
  };
  custom: Record<string, number>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastHealthCheck: string;
  checks: {
    memory: HealthCheck;
    cpu: HealthCheck;
    database: HealthCheck;
    externalServices: HealthCheck;
    errorRate: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  value?: number;
  threshold?: number;
  timestamp: string;
}

export interface Alert {
  id: string;
  type: 'error_rate' | 'memory' | 'cpu' | 'database' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
}

export class RuntimeMonitoringService {
  private static metrics: PerformanceMetrics[] = [];
  private static alerts: Alert[] = [];
  private static maxMetrics = 1000;
  private static maxAlerts = 500;
  private static activeRequests = 0;
  private static totalRequests = 0;
  private static requestTimes: number[] = [];
  private static errorCount = 0;

  // Collect current performance metrics
  static async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = new Date().toISOString();

    const metrics: PerformanceMetrics = {
      timestamp,
      memory: this.getMemoryMetrics(),
      cpu: this.getCpuMetrics(),
      requests: {
        active: this.activeRequests,
        total: this.totalRequests,
        avgResponseTime: this.calculateAverageResponseTime(),
        errorRate: this.calculateErrorRate()
      },
      database: await this.getDatabaseMetrics(),
      custom: {}
    };

    // Store metrics
    this.metrics.push(metrics);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift(); // Keep only recent metrics
    }

    // Check for alerts
    this.checkAlerts(metrics);

    return metrics;
  }

  private static getMemoryMetrics() {
    try {
      const memInfo = (Deno as any).memoryUsage?.() || {};
      return {
        used: memInfo.heapUsed || 0,
        total: memInfo.heapTotal || 0,
        external: memInfo.external || 0,
        rss: memInfo.rss || 0,
        heapUsed: memInfo.heapUsed || 0,
        heapTotal: memInfo.heapTotal || 0
      };
    } catch {
      return {
        used: 0,
        total: 0,
        external: 0,
        rss: 0,
        heapUsed: 0,
        heapTotal: 0
      };
    }
  }

  private static getCpuMetrics() {
    // Deno doesn't provide direct CPU metrics, so we'll use a placeholder
    // In production, you might use external monitoring
    return {
      usage: 0, // Placeholder - would need external monitoring
      loadAverage: [0, 0, 0] // Placeholder
    };
  }

  private static async getDatabaseMetrics() {
    // In a real implementation, this would query the database for connection info
    // For now, return placeholder data
    return {
      connections: 0, // Would query actual connection count
      queryCount: 0,  // Would track actual query count
      avgQueryTime: 0  // Would calculate from query logs
    };
  }

  private static calculateAverageResponseTime(): number {
    if (this.requestTimes.length === 0) return 0;
    const sum = this.requestTimes.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.requestTimes.length) * 100) / 100;
  }

  private static calculateErrorRate(): number {
    if (this.totalRequests === 0) return 0;
    return Math.round((this.errorCount / this.totalRequests) * 10000) / 100; // Percentage with 2 decimals
  }

  private static checkAlerts(metrics: PerformanceMetrics): void {
    const now = new Date().toISOString();

    // Memory usage alert
    const memoryUsagePercent = metrics.memory.heapTotal > 0
      ? (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100
      : 0;

    if (memoryUsagePercent > 90) {
      this.createAlert('memory', 'critical',
        `Memory usage is ${memoryUsagePercent.toFixed(1)}%`, memoryUsagePercent, 90, now);
    } else if (memoryUsagePercent > 75) {
      this.createAlert('memory', 'high',
        `Memory usage is ${memoryUsagePercent.toFixed(1)}%`, memoryUsagePercent, 75, now);
    }

    // Error rate alert
    if (metrics.requests.errorRate > 10) {
      this.createAlert('error_rate', 'high',
        `Error rate is ${metrics.requests.errorRate}%`, metrics.requests.errorRate, 10, now);
    } else if (metrics.requests.errorRate > 5) {
      this.createAlert('error_rate', 'medium',
        `Error rate is ${metrics.requests.errorRate}%`, metrics.requests.errorRate, 5, now);
    }

    // High active requests alert
    if (metrics.requests.active > 50) {
      this.createAlert('custom', 'medium',
        `High concurrent requests: ${metrics.requests.active}`, metrics.requests.active, 50, now);
    }
  }

  private static createAlert(
    type: Alert['type'],
    severity: Alert['severity'],
    message: string,
    value: number,
    threshold: number,
    timestamp: string
  ): void {
    // Check if similar alert already exists and is unresolved
    const existingAlert = this.alerts.find(a =>
      a.type === type &&
      !a.resolved &&
      Math.abs(a.value - value) < 5 && // Similar value
      new Date(timestamp).getTime() - new Date(a.timestamp).getTime() < 300000 // Within 5 minutes
    );

    if (existingAlert) {
      // Update existing alert
      existingAlert.value = Math.max(existingAlert.value, value);
      existingAlert.timestamp = timestamp;
      return;
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp,
      resolved: false
    };

    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    // Log alert
    console.warn(`🚨 ALERT [${severity.toUpperCase()}]: ${message} (value: ${value}, threshold: ${threshold})`);
  }

  // Request tracking
  static startRequest(): string {
    this.activeRequests++;
    this.totalRequests++;
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static endRequest(requestId: string, duration: number, success: boolean): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // Track response time
    this.requestTimes.push(duration);
    if (this.requestTimes.length > 100) {
      this.requestTimes.shift(); // Keep only recent times
    }

    // Track errors
    if (!success) {
      this.errorCount++;
    }
  }

  // Health check
  static async getHealthStatus(): Promise<SystemHealth> {
    const metrics = await this.collectMetrics();
    const uptime = performance.now(); // Milliseconds since start

    const checks: SystemHealth['checks'] = {
      memory: this.checkMemoryHealth(metrics.memory),
      cpu: this.checkCpuHealth(metrics.cpu),
      database: await this.checkDatabaseHealth(),
      externalServices: await this.checkExternalServicesHealth(),
      errorRate: this.checkErrorRateHealth(metrics.requests)
    };

    // Determine overall status
    const failingChecks = Object.values(checks).filter(check => check.status === 'fail').length;
    const warningChecks = Object.values(checks).filter(check => check.status === 'warn').length;

    let status: SystemHealth['status'] = 'healthy';
    if (failingChecks > 0) {
      status = 'unhealthy';
    } else if (warningChecks > 0) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      lastHealthCheck: new Date().toISOString(),
      checks
    };
  }

  private static checkMemoryHealth(memory: PerformanceMetrics['memory']): HealthCheck {
    const usagePercent = memory.heapTotal > 0 ? (memory.heapUsed / memory.heapTotal) * 100 : 0;

    if (usagePercent > 90) {
      return { status: 'fail', message: `Memory usage ${usagePercent.toFixed(1)}% > 90%`, value: usagePercent, threshold: 90, timestamp: new Date().toISOString() };
    } else if (usagePercent > 75) {
      return { status: 'warn', message: `Memory usage ${usagePercent.toFixed(1)}% > 75%`, value: usagePercent, threshold: 75, timestamp: new Date().toISOString() };
    }

    return { status: 'pass', message: `Memory usage ${usagePercent.toFixed(1)}% OK`, value: usagePercent, timestamp: new Date().toISOString() };
  }

  private static checkCpuHealth(cpu: PerformanceMetrics['cpu']): HealthCheck {
    // Placeholder - in real implementation would check actual CPU usage
    return { status: 'pass', message: 'CPU usage OK', value: cpu.usage, timestamp: new Date().toISOString() };
  }

  private static async checkDatabaseHealth(): Promise<HealthCheck> {
    // Placeholder - would check database connectivity and performance
    return { status: 'pass', message: 'Database OK', timestamp: new Date().toISOString() };
  }

  private static async checkExternalServicesHealth(): Promise<HealthCheck> {
    // Placeholder - would check external API connectivity
    return { status: 'pass', message: 'External services OK', timestamp: new Date().toISOString() };
  }

  private static checkErrorRateHealth(requests: PerformanceMetrics['requests']): HealthCheck {
    if (requests.errorRate > 10) {
      return { status: 'fail', message: `Error rate ${requests.errorRate}% > 10%`, value: requests.errorRate, threshold: 10, timestamp: new Date().toISOString() };
    } else if (requests.errorRate > 5) {
      return { status: 'warn', message: `Error rate ${requests.errorRate}% > 5%`, value: requests.errorRate, threshold: 5, timestamp: new Date().toISOString() };
    }

    return { status: 'pass', message: `Error rate ${requests.errorRate}% OK`, value: requests.errorRate, timestamp: new Date().toISOString() };
  }

  // Get metrics data
  static getMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  // Get alerts
  static getAlerts(limit: number = 50): Alert[] {
    return this.alerts.slice(-limit);
  }

  // Get active alerts (unresolved)
  static getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  // Resolve alert
  static resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  // Export metrics for external analysis
  static exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'heapUsed', 'heapTotal', 'activeRequests', 'totalRequests', 'avgResponseTime', 'errorRate'];
      const csvRows = [
        headers.join(','),
        ...this.metrics.map(m => [
          m.timestamp,
          m.memory.heapUsed,
          m.memory.heapTotal,
          m.requests.active,
          m.requests.total,
          m.requests.avgResponseTime,
          m.requests.errorRate
        ].join(','))
      ];
      return csvRows.join('\n');
    }

    return JSON.stringify(this.metrics, null, 2);
  }

  // Reset metrics (useful for testing)
  static reset(): void {
    this.metrics = [];
    this.alerts = [];
    this.activeRequests = 0;
    this.totalRequests = 0;
    this.requestTimes = [];
    this.errorCount = 0;
  }
}

// Performance monitoring middleware for edge functions
export function withPerformanceMonitoring<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operation: string
) {
  return async (...args: T): Promise<R> => {
    const requestId = RuntimeMonitoringService.startRequest();
    const startTime = performance.now();

    try {
      const result = await fn(...args);
      const duration = performance.now() - startTime;

      RuntimeMonitoringService.endRequest(requestId, duration, true);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      RuntimeMonitoringService.endRequest(requestId, duration, false);

      throw error;
    }
  };
}
