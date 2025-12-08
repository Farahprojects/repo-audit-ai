import { AppError, GitHubError, GeminiError, AuthenticationError, NetworkError } from '../types';

// Error logging levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Structured error logger
export class ErrorLogger {
  private static formatContext(context?: Record<string, any>): string {
    if (!context) return '';
    return Object.entries(context)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
  }

  static log(level: LogLevel, message: string, error?: Error | AppError, context?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const contextStr = this.formatContext(context);
    const errorInfo = error ? ` | Error: ${error.message} | Stack: ${error.stack}` : '';

    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${errorInfo}${contextStr ? ` | Context: ${contextStr}` : ''}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(logMessage);
        break;
    }

    // In production, you might want to send critical errors to a monitoring service
    if (level === LogLevel.CRITICAL && process.env.NODE_ENV === 'production') {
      // Send to error monitoring service (e.g., Sentry, LogRocket, etc.)
      this.reportToMonitoring(error, context);
    }
  }

  private static reportToMonitoring(error?: Error | AppError, context?: Record<string, any>) {
    // Placeholder for error monitoring integration
    // Example: Sentry.captureException(error, { extra: context });
    console.error('CRITICAL ERROR REPORTED:', { error, context });
  }

  static debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, undefined, context);
  }

  static info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, undefined, context);
  }

  static warn(message: string, error?: Error | AppError, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, error, context);
  }

  static error(message: string, error?: Error | AppError, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, error, context);
  }

  static critical(message: string, error?: Error | AppError, context?: Record<string, any>) {
    this.log(LogLevel.CRITICAL, message, error, context);
  }
}

// Error handling utilities
export class ErrorHandler {
  static handleGitHubError(error: any, operation: string, context?: Record<string, any>): never {
    let gitHubError: GitHubError;

    if (error instanceof AppError) {
      throw error;
    }

    // Handle GitHub API specific errors
    if (error?.status === 404) {
      gitHubError = new GitHubError('Repository or owner not found', 'NOT_FOUND', { ...context, operation });
    } else if (error?.status === 403) {
      if (error.message?.includes('rate limit')) {
        gitHubError = new GitHubError('GitHub API rate limit exceeded', 'RATE_LIMIT', { ...context, operation });
      } else {
        gitHubError = new GitHubError('Access forbidden - repository may be private', 'FORBIDDEN', { ...context, operation });
      }
    } else if (error?.status === 401) {
      gitHubError = new AuthenticationError('GitHub authentication failed', { ...context, operation });
    } else if (!navigator.onLine) {
      gitHubError = new NetworkError('Network connection lost', { ...context, operation });
    } else {
      gitHubError = new GitHubError(
        error?.message || 'GitHub API request failed',
        'API_ERROR',
        { ...context, operation, originalError: error }
      );
    }

    ErrorLogger.error(`GitHub ${operation} failed`, gitHubError, context);
    throw gitHubError;
  }

  static handleGeminiError(error: any, operation: string, context?: Record<string, any>): never {
    let geminiError: GeminiError;

    if (error instanceof AppError) {
      throw error;
    }

    // Handle Gemini API specific errors
    if (error?.status === 429) {
      geminiError = new GeminiError('Gemini API rate limit exceeded', 'RATE_LIMIT', { ...context, operation });
    } else if (error?.status === 403 || error?.status === 401) {
      geminiError = new AuthenticationError('Gemini API authentication failed', { ...context, operation });
    } else if (error?.status >= 500) {
      geminiError = new GeminiError('Gemini API server error', 'SERVER_ERROR', { ...context, operation });
    } else if (!navigator.onLine) {
      geminiError = new NetworkError('Network connection lost during AI processing', { ...context, operation });
    } else {
      geminiError = new GeminiError(
        error?.message || 'AI processing failed',
        'PROCESSING_ERROR',
        { ...context, operation, originalError: error }
      );
    }

    ErrorLogger.error(`Gemini ${operation} failed`, geminiError, context);
    throw geminiError;
  }

  static handleAuthError(error: any, operation: string, context?: Record<string, any>): never {
    const authError = new AuthenticationError(
      error?.message || 'Authentication failed',
      { ...context, operation, originalError: error }
    );

    ErrorLogger.error(`Authentication ${operation} failed`, authError, context);
    throw authError;
  }

  static handleNetworkError(error: any, operation: string, context?: Record<string, any>): never {
    const networkError = new NetworkError(
      error?.message || 'Network request failed',
      { ...context, operation, originalError: error }
    );

    ErrorLogger.error(`Network ${operation} failed`, networkError, context);
    throw networkError;
  }

  // Safe async wrapper that converts thrown errors to return values
  static async safeAsync<T>(
    operation: () => Promise<T>,
    fallbackValue?: T,
    context?: Record<string, any>
  ): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError(
        error instanceof Error ? error.message : 'Unknown error',
        'UNKNOWN_ERROR',
        500,
        { ...context, originalError: error }
      );

      ErrorLogger.error('Safe async operation failed', appError, context);
      return { success: false, error: appError };
    }
  }

  // Wrapper for operations that should never fail silently
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      ErrorLogger.debug(`${operationName} started`, context);
      const result = await operation();
      ErrorLogger.debug(`${operationName} completed successfully`, context);
      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error; // Re-throw our structured errors
      }

      // Convert unknown errors to AppError
      const appError = new AppError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'UNKNOWN_ERROR',
        500,
        { ...context, operation: operationName, originalError: error }
      );

      ErrorLogger.error(`${operationName} failed with unknown error`, appError, context);
      throw appError;
    }
  }
}

// Hook for handling errors in React components
export function useErrorHandler() {
  const handleError = (error: Error | AppError, context?: Record<string, any>) => {
    if (error instanceof AppError) {
      ErrorLogger.error('Component error', error, context);
      // Could dispatch to error state management here
    } else {
      ErrorLogger.error('Unexpected component error', error, context);
    }
  };

  const safeAsync = ErrorHandler.safeAsync;

  return { handleError, safeAsync };
}
