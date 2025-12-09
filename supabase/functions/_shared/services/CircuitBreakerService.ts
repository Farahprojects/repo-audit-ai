interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  monitoringPeriod: number
}

interface CircuitState {
  failures: number
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
}

export class CircuitBreakerService {
  private static breakers = new Map<string, CircuitState>()

  private static defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5, // Open circuit after 5 failures
    resetTimeout: 60000, // Try again after 1 minute
    monitoringPeriod: 300000 // Reset failure count after 5 minutes of success
  }

  static async executeWithCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    config: Partial<CircuitBreakerConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config }
    const state = this.getOrCreateBreaker(serviceName)

    // Check if circuit is open
    if (state.state === 'open') {
      if (Date.now() - state.lastFailureTime > finalConfig.resetTimeout) {
        // Try half-open
        state.state = 'half-open'
      } else {
        throw new Error(`Circuit breaker open for ${serviceName}. Too many recent failures.`)
      }
    }

    try {
      const result = await operation()

      // Success - reset failure count and close circuit
      if (state.state === 'half-open') {
        state.state = 'closed'
      }

      // Reset failure count if enough time has passed
      if (Date.now() - state.lastFailureTime > finalConfig.monitoringPeriod) {
        state.failures = 0
      }

      return result

    } catch (error) {
      // Record failure
      state.failures++
      state.lastFailureTime = Date.now()

      // Open circuit if threshold exceeded
      if (state.failures >= finalConfig.failureThreshold) {
        state.state = 'open'
      }

      throw error
    }
  }

  static getBreakerStatus(serviceName: string): CircuitState | null {
    return this.breakers.get(serviceName) || null
  }

  static resetBreaker(serviceName: string): void {
    this.breakers.delete(serviceName)
  }

  static getAllBreakerStatuses(): Record<string, CircuitState> {
    const statuses: Record<string, CircuitState> = {}
    for (const [name, state] of this.breakers.entries()) {
      statuses[name] = { ...state }
    }
    return statuses
  }

  private static getOrCreateBreaker(serviceName: string): CircuitState {
    let state = this.breakers.get(serviceName)
    if (!state) {
      state = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed'
      }
      this.breakers.set(serviceName, state)
    }
    return state
  }
}

// Pre-configured circuit breakers for common services
export class GitHubCircuitBreaker {
  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    return CircuitBreakerService.executeWithCircuitBreaker(
      'github-api',
      operation,
      {
        failureThreshold: 3, // GitHub is more sensitive to rate limits
        resetTimeout: 30000, // Try again in 30 seconds
        monitoringPeriod: 600000 // 10 minutes
      }
    )
  }
}

export class AICircuitBreaker {
  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    return CircuitBreakerService.executeWithCircuitBreaker(
      'ai-api',
      operation,
      {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        monitoringPeriod: 300000 // 5 minutes
      }
    )
  }
}
