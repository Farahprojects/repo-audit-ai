interface RetryConfig {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors?: (error: any) => boolean
}

export class RetryService {
  private static defaultConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    retryableErrors: (error) => {
      // Retry on network errors, rate limits, and temporary server errors
      const message = error?.message?.toLowerCase() || ''
      const status = error?.status || error?.code

      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('temporary') ||
        status === 429 || // Rate limit
        status === 502 || // Bad Gateway
        status === 503 || // Service Unavailable
        status === 504    // Gateway Timeout
      )
    }
  }

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config }
    let lastError: any

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        // Don't retry if it's the last attempt or error is not retryable
        if (attempt === finalConfig.maxAttempts ||
            !finalConfig.retryableErrors!(error)) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.initialDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay
        )

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000

        console.log(`Attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms:`, error instanceof Error ? error.message : String(error))
        await this.sleep(jitteredDelay)
      }
    }

    throw lastError
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Specialized retry configurations for different services
export class GitHubRetry {
  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    return RetryService.executeWithRetry(operation, {
      maxAttempts: 3,
      initialDelay: 2000, // GitHub secondary rate limit
      maxDelay: 60000, // 1 minute max
      retryableErrors: (error) => {
        const status = error?.status || error?.code
        const message = error?.message?.toLowerCase() || ''

        return (
          status === 403 && message.includes('rate limit') ||
          status === 429 ||
          status >= 500
        )
      }
    })
  }
}

export class AIRetry {
  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    return RetryService.executeWithRetry(operation, {
      maxAttempts: 2, // AI APIs are more expensive, retry less
      initialDelay: 5000,
      maxDelay: 30000,
      retryableErrors: (error) => {
        const status = error?.status || error?.code
        return status >= 500 || status === 429
      }
    })
  }
}
