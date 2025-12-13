/// <reference lib="deno.ns" />

// @ts-ignore - Deno environment provides global Deno object
declare const Deno: any;

// Advanced Error Tracking and Reporting Service
// Captures detailed error information for debugging and monitoring

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: Error;
  timestamp: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  component?: string;
  function?: string;
  errorType?: string;
  repoId?: string;
  duration?: number;
  preflightId?: string;
  tier?: string;
  operation?: string;
  workerIndex?: number;
  statusCode?: number;
  filePath?: string;
  metadata?: Record<string, any>;
}

export interface ErrorReport {
  id: string;
  error: ErrorDetails;
  context: {
    environment: string;
    version: string;
    platform: string;
    memoryUsage?: any;
    requestInfo?: any;
  };
  breadcrumbs: Breadcrumb[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  fingerprint: string; // For error grouping
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Breadcrumb {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  category: string;
  metadata?: Record<string, any>;
}

export class ErrorTrackingService {
  private static errors: ErrorReport[] = [];
  private static breadcrumbs: Breadcrumb[] = [];
  private static maxBreadcrumbs = 100;
  private static maxErrors = 1000;

  // Track an error with default severity (convenience method)
  static trackError(
    error: Error | string,
    context: Partial<ErrorDetails> = {},
    severity: ErrorReport['severity'] = 'medium'
  ): string {
    return this.captureError(error, context, severity);
  }

  // Capture and report an error
  static captureError(
    error: Error | string,
    context: Partial<ErrorDetails> = {},
    severity: ErrorReport['severity'] = 'medium'
  ): string {
    const errorDetails = this.buildErrorDetails(error, context);
    const errorReport = this.createErrorReport(errorDetails, severity);

    // Add to error store
    this.errors.push(errorReport);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // Remove oldest
    }

    // Send to external error tracking (production)
    this.sendToErrorTracker(errorReport);

    // Log the error
    console.error(`[ErrorTracking] ${errorReport.error.name}: ${errorReport.error.message}`, {
      errorId: errorReport.id,
      correlationId: errorReport.error.correlationId,
      component: errorReport.error.component
    });

    return errorReport.id;
  }

  // Add breadcrumb for debugging context
  static addBreadcrumb(
    message: string,
    category: string,
    level: Breadcrumb['level'] = 'info',
    metadata?: Record<string, any>
  ): void {
    const breadcrumb: Breadcrumb = {
      timestamp: new Date().toISOString(),
      level,
      message,
      category,
      ...(metadata ? { metadata } : {}) // Only include if defined
    };

    this.breadcrumbs.push(breadcrumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift(); // Keep only recent breadcrumbs
    }
  }

  // Capture unhandled errors automatically
  static setupGlobalErrorTracking(): void {
    // Capture console errors
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      this.captureError(new Error(args.join(' ')), {
        component: 'Console',
        function: 'error'
      });
    };

    // Capture unhandled promise rejections
    if (typeof globalThis !== 'undefined') {
      globalThis.addEventListener?.('unhandledrejection', (event) => {
        this.captureError(event.reason || new Error('Unhandled promise rejection'), {
          component: 'Global',
          function: 'unhandledRejection'
        }, 'high');
      });

      globalThis.addEventListener?.('error', (event) => {
        this.captureError(event.error || new Error('Uncaught error'), {
          component: 'Global',
          function: 'uncaughtError'
        }, 'critical');
      });
    }
  }

  private static buildErrorDetails(error: Error | string, context: Partial<ErrorDetails>): ErrorDetails {
    const err = typeof error === 'string' ? new Error(error) : error;

    return {
      name: err.name || 'Error',
      message: err.message || 'Unknown error',
      stack: err.stack || '', // Ensure string
      code: (err as any).code,
      cause: err.cause as Error,
      timestamp: new Date().toISOString(),
      ...(typeof globalThis !== 'undefined' && (globalThis as any).location?.href ? { url: (globalThis as any).location.href } : {}),
      ...(typeof globalThis !== 'undefined' && (globalThis as any).navigator?.userAgent ? { userAgent: (globalThis as any).navigator.userAgent } : {}),
      ...context
    };
  }

  private static createErrorReport(errorDetails: ErrorDetails, severity: ErrorReport['severity']): ErrorReport {
    const fingerprint = this.generateErrorFingerprint(errorDetails);
    const existingError = this.errors.find(e => e.fingerprint === fingerprint);

    if (existingError) {
      // Update existing error
      existingError.occurrences++;
      existingError.lastSeen = errorDetails.timestamp;
      return existingError;
    }

    // Create new error report
    const report: ErrorReport = {
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      error: errorDetails,
      context: {
        environment: Deno.env.get('ENVIRONMENT') || 'development',
        version: '1.0.0',
        platform: 'supabase-edge-functions',
        memoryUsage: this.getMemoryUsage(),
        requestInfo: this.getRequestInfo()
      },
      breadcrumbs: [...this.breadcrumbs], // Copy recent breadcrumbs
      severity,
      fingerprint,
      occurrences: 1,
      firstSeen: errorDetails.timestamp,
      lastSeen: errorDetails.timestamp
    };

    return report;
  }

  private static generateErrorFingerprint(error: ErrorDetails): string {
    // Create a unique fingerprint for error grouping
    const components = [
      error.name,
      error.message.split('\n')[0], // First line of message
      error.component || 'unknown',
      error.function || 'unknown'
    ];

    // Simple hash function
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  private static getMemoryUsage(): any {
    try {
      return (Deno as any).memoryUsage?.() || { note: 'Not available' };
    } catch {
      return { note: 'Not available' };
    }
  }

  private static getRequestInfo(): any {
    // In edge functions, we might not have request context here
    // This would be populated by the calling function
    return { note: 'Request context not available' };
  }

  private static sendToErrorTracker(report: ErrorReport): void {
    // In production, this would send to error tracking services like:
    // - Sentry, Rollbar, Bugsnag
    // - DataDog Error Tracking
    // - Custom error dashboards

    // For development, we just log it
    if (report.severity === 'critical') {
      console.error('🚨 CRITICAL ERROR REPORT:', JSON.stringify(report, null, 2));
    }
  }

  // Get error reports for monitoring
  static getErrorReports(limit: number = 50): ErrorReport[] {
    return this.errors.slice(-limit);
  }

  // Get errors by severity
  static getErrorsBySeverity(severity: ErrorReport['severity']): ErrorReport[] {
    return this.errors.filter(e => e.severity === severity);
  }

  // Get error statistics
  static getErrorStats(): {
    total: number;
    bySeverity: Record<string, number>;
    recentErrors: ErrorReport[];
    topFingerprints: Array<{ fingerprint: string; count: number; lastError: string }>;
  } {
    const bySeverity = this.errors.reduce((acc, err) => {
      acc[err.severity] = (acc[err.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const fingerprintCounts = this.errors.reduce((acc, err) => {
      if (!acc[err.fingerprint]) {
        acc[err.fingerprint] = { count: 0, lastError: err.error.message };
      }
      // At this point we know acc[err.fingerprint] exists
      acc[err.fingerprint]!.count += err.occurrences;
      return acc;
    }, {} as Record<string, { count: number; lastError: string }>);

    const topFingerprints = Object.entries(fingerprintCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([fingerprint, data]) => ({
        fingerprint,
        count: data.count,
        lastError: data.lastError
      }));

    return {
      total: this.errors.length,
      bySeverity,
      recentErrors: this.errors.slice(-10),
      topFingerprints
    };
  }

  // Get breadcrumbs for debugging
  static getBreadcrumbs(limit: number = 50): Breadcrumb[] {
    return this.breadcrumbs.slice(-limit);
  }

  // Export error data for analysis
  static exportErrors(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['id', 'timestamp', 'severity', 'name', 'message', 'component', 'function', 'occurrences'];
      const csvRows = [
        headers.join(','),
        ...this.errors.map(err => [
          err.id,
          err.error.timestamp,
          err.severity,
          `"${err.error.name}"`,
          `"${err.error.message.replace(/"/g, '""')}"`,
          err.error.component || '',
          err.error.function || '',
          err.occurrences
        ].join(','))
      ];
      return csvRows.join('\n');
    }

    return JSON.stringify(this.errors, null, 2);
  }
}

// Performance monitoring decorator
export function withErrorTracking<T extends any[], R>(
  fn: (...args: T) => R,
  context: { component: string; function: string }
) {
  return (...args: T): R => {
    const startTime = performance.now();

    try {
      ErrorTrackingService.addBreadcrumb(
        `Starting ${context.function}`,
        'function',
        'debug',
        { component: context.component, args: args.length }
      );

      const result = fn(...args);

      const duration = performance.now() - startTime;
      ErrorTrackingService.addBreadcrumb(
        `Completed ${context.function} in ${duration.toFixed(2)}ms`,
        'function',
        'debug',
        { component: context.component, duration }
      );

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      ErrorTrackingService.captureError(error as Error, {
        ...context,
        duration: Math.round(duration * 100) / 100
      }, 'high');

      throw error;
    }
  };
}
