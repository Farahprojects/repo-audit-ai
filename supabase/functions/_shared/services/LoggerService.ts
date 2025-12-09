// Comprehensive Logging Service for Full Runtime Visibility
// Provides structured logging, error tracking, and observability

export interface LogContext {
  userId?: string;
  requestId?: string;
  sessionId?: string;
  auditId?: string;
  preflightId?: string;
  tier?: string;
  component?: string;
  function?: string;
  duration?: number;
  memoryUsage?: number;
  error?: Error;
  correlationId?: string;
  errorType?: string;
  checkpoint?: string;
  method?: string;
  taskCount?: number;
  url?: string;
  endpoint?: string;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  context: LogContext;
  stack?: string;
  correlationId?: string;
}

export class LoggerService {
  private static logs: LogEntry[] = [];
  private static maxLogs = 10000; // Keep last 10k logs in memory
  private static correlationCounter = 0;

  // ANSI color codes for console output
  private static colors = {
    DEBUG: '\x1b[36m',    // Cyan
    INFO: '\x1b[32m',     // Green
    WARN: '\x1b[33m',     // Yellow
    ERROR: '\x1b[31m',    // Red
    CRITICAL: '\x1b[35m', // Magenta
    RESET: '\x1b[0m'
  };

  static generateCorrelationId(): string {
    return `corr-${Date.now()}-${++this.correlationCounter}`;
  }

  static debug(message: string, context: LogContext = {}): void {
    this.log('DEBUG', message, context);
  }

  static info(message: string, context: LogContext = {}): void {
    this.log('INFO', message, context);
  }

  static warn(message: string, context: LogContext = {}): void {
    this.log('WARN', message, context);
  }

  static error(message: string, error?: Error, context: LogContext = {}): void {
    const errorContext = { ...context, error };
    this.log('ERROR', message, errorContext, error?.stack);
  }

  static critical(message: string, error?: Error, context: LogContext = {}): void {
    const errorContext = { ...context, error };
    this.log('CRITICAL', message, errorContext, error?.stack);

    // For critical errors, also send alerts (in production this would integrate with alerting systems)
    this.sendAlert(message, errorContext);
  }

  private static log(level: LogEntry['level'], message: string, context: LogContext, stack?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...context },
      stack,
      correlationId: context.correlationId || this.generateCorrelationId()
    };

    // Add to in-memory log store
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest log
    }

    // Console output with colors and structured format
    this.consoleOutput(entry);

    // Send to external monitoring (in production)
    this.sendToMonitoring(entry);
  }

  private static consoleOutput(entry: LogEntry): void {
    const color = this.colors[entry.level];
    const reset = this.colors.RESET;

    const contextStr = Object.keys(entry.context).length > 0
      ? ` ${JSON.stringify(entry.context)}`
      : '';

    console.log(`${color}[${entry.level}]${reset} ${entry.timestamp} ${entry.message}${contextStr}`);

    if (entry.stack) {
      console.log(`${color}Stack:${reset} ${entry.stack}`);
    }
  }

  private static sendToMonitoring(entry: LogEntry): void {
    // In production, this would send to services like:
    // - DataDog, New Relic, CloudWatch
    // - Elasticsearch, Splunk
    // - Custom monitoring dashboards

    // For now, we'll just store in memory and provide access via API
    // This could be extended to send HTTP requests to monitoring services
  }

  private static sendAlert(message: string, context: LogContext): void {
    // Critical alerts - in production this would:
    // - Send emails/SMS to on-call engineers
    // - Create tickets in incident management systems
    // - Trigger PagerDuty/opsgenie alerts
    // - Send Slack/Discord notifications

    console.error(`🚨 CRITICAL ALERT: ${message}`, context);
  }

  // Request tracing and performance monitoring
  static startRequest(operation: string, context: LogContext = {}): RequestTracer {
    return new RequestTracer(operation, context);
  }

  // Get recent logs for debugging
  static getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Get logs by correlation ID for request tracing
  static getLogsByCorrelation(correlationId: string): LogEntry[] {
    return this.logs.filter(log => log.correlationId === correlationId);
  }

  // Get logs by level
  static getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  // Get error logs
  static getErrors(): LogEntry[] {
    return this.logs.filter(log => ['ERROR', 'CRITICAL'].includes(log.level));
  }

  // Performance metrics
  static getMetrics(): {
    totalLogs: number;
    errors: number;
    warnings: number;
    avgLogsPerMinute: number;
    recentErrors: LogEntry[];
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentLogs = this.logs.filter(log => new Date(log.timestamp).getTime() > oneHourAgo);

    return {
      totalLogs: this.logs.length,
      errors: this.logs.filter(log => log.level === 'ERROR').length,
      warnings: this.logs.filter(log => log.level === 'WARN').length,
      avgLogsPerMinute: recentLogs.length / 60,
      recentErrors: this.getErrors().slice(-10)
    };
  }

  // Export logs for external analysis
  static exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'level', 'message', 'correlationId', 'component', 'function', 'userId', 'auditId'];
      const csvRows = [
        headers.join(','),
        ...this.logs.map(log => [
          log.timestamp,
          log.level,
          `"${log.message.replace(/"/g, '""')}"`,
          log.correlationId,
          log.context.component,
          log.context.function,
          log.context.userId,
          log.context.auditId
        ].join(','))
      ];
      return csvRows.join('\n');
    }

    return JSON.stringify(this.logs, null, 2);
  }
}

// Request tracing for performance monitoring
export class RequestTracer {
  private startTime: number;
  private operation: string;
  private context: LogContext;
  private correlationId: string;
  private checkpoints: Array<{ name: string; timestamp: number; metadata?: any }> = [];

  constructor(operation: string, context: LogContext = {}) {
    this.startTime = performance.now();
    this.operation = operation;
    this.context = { ...context };
    this.correlationId = context.correlationId || LoggerService.generateCorrelationId();

    LoggerService.info(`Started ${operation}`, {
      ...this.context,
      correlationId: this.correlationId,
      component: 'RequestTracer'
    });
  }

  checkpoint(name: string, metadata?: any): void {
    const timestamp = performance.now();
    this.checkpoints.push({ name, timestamp, metadata });

    LoggerService.debug(`Checkpoint: ${name}`, {
      ...this.context,
      correlationId: this.correlationId,
      checkpoint: name,
      duration: timestamp - this.startTime,
      metadata
    });
  }

  end(success: boolean = true, result?: any): void {
    const endTime = performance.now();
    const duration = endTime - this.startTime;

    const logData = {
      ...this.context,
      correlationId: this.correlationId,
      duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
      checkpoints: this.checkpoints.length,
      success,
      result: result ? JSON.stringify(result).slice(0, 200) : undefined // Truncate long results
    };

    if (success) {
      LoggerService.info(`Completed ${this.operation} in ${duration.toFixed(2)}ms`, logData);
    } else {
      LoggerService.error(`Failed ${this.operation} after ${duration.toFixed(2)}ms`, undefined, logData);
    }
  }

  error(error: Error, metadata?: any): void {
    const endTime = performance.now();
    const duration = endTime - this.startTime;

    LoggerService.error(`${this.operation} failed`, error, {
      ...this.context,
      correlationId: this.correlationId,
      duration: Math.round(duration * 100) / 100,
      checkpoints: this.checkpoints.length,
      ...metadata
    });
  }

  getCorrelationId(): string {
    return this.correlationId;
  }
}

// Global error handler for uncaught errors
export function setupGlobalErrorHandler(): void {
  // Handle uncaught errors in edge functions
  if (typeof globalThis !== 'undefined') {
    globalThis.addEventListener?.('error', (event) => {
      LoggerService.critical('Uncaught error', event.error, {
        component: 'GlobalErrorHandler',
        errorType: 'uncaught'
      });
    });

    globalThis.addEventListener?.('unhandledrejection', (event) => {
      LoggerService.critical('Unhandled promise rejection', event.reason, {
        component: 'GlobalErrorHandler',
        errorType: 'unhandledRejection'
      });
    });
  }
}
