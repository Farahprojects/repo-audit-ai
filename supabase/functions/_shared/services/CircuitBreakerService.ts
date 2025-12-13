interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeout: number
  monitoringPeriod: number
}

interface CircuitState {
  failures: number
  lastFailureTime: number
  state: 'closed' | 'open' | 'half-open'
  lastAccessed: number // For LRU eviction
  createdAt: number // For cleanup tracking
}

export class CircuitBreakerService {
  private static breakers = new Map<string, CircuitState>()

  // Memory management settings
  private static readonly MAX_BREAKERS = 1000 // Maximum number of circuit breakers
  private static readonly CLEANUP_INTERVAL = 300000 // Clean up every 5 minutes
  private static readonly MAX_AGE = 3600000 // Remove breakers older than 1 hour
  private static readonly WARNING_THRESHOLD = 800 // Warn when approaching limit

  private static lastCleanup = Date.now()

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

  static getAllBreakerStatuses(): Record<string, Omit<CircuitState, 'lastAccessed' | 'createdAt'>> {
    const statuses: Record<string, Omit<CircuitState, 'lastAccessed' | 'createdAt'>> = {}
    for (const [name, state] of this.breakers.entries()) {
      const { lastAccessed, createdAt, ...publicState } = state
      statuses[name] = publicState
    }
    return statuses
  }

  private static getOrCreateBreaker(serviceName: string): CircuitState {
    // Periodic cleanup
    this.cleanupIfNeeded()

    let state = this.breakers.get(serviceName)
    if (!state) {
      // Check if we're approaching the limit
      if (this.breakers.size >= this.WARNING_THRESHOLD) {
        console.warn(`[CircuitBreaker] Approaching breaker limit: ${this.breakers.size}/${this.MAX_BREAKERS} breakers`)
      }

      // If at limit, evict oldest breaker
      if (this.breakers.size >= this.MAX_BREAKERS) {
        this.evictOldestBreaker()
      }

      state = {
        failures: 0,
        lastFailureTime: 0,
        state: 'closed',
        lastAccessed: Date.now(),
        createdAt: Date.now()
      }
      this.breakers.set(serviceName, state)
    } else {
      // Update access time
      state.lastAccessed = Date.now()
    }
    return state
  }

  /**
   * Clean up old circuit breakers periodically
   */
  private static cleanupIfNeeded(): void {
    const now = Date.now()
    if (now - this.lastCleanup > this.CLEANUP_INTERVAL) {
      this.performCleanup()
      this.lastCleanup = now
    }
  }

  /**
   * Remove circuit breakers that haven't been accessed recently
   */
  private static performCleanup(): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [serviceName, state] of this.breakers.entries()) {
      // Remove breakers that are old and haven't been accessed recently
      if (now - state.createdAt > this.MAX_AGE && now - state.lastAccessed > this.MAX_AGE) {
        toRemove.push(serviceName)
      }
    }

    for (const serviceName of toRemove) {
      this.breakers.delete(serviceName)
    }

    if (toRemove.length > 0) {
      console.log(`[CircuitBreaker] Cleaned up ${toRemove.length} old circuit breakers`)
    }
  }

  /**
   * Evict the least recently used circuit breaker when at capacity
   */
  private static evictOldestBreaker(): void {
    let oldestName: string | null = null
    let oldestTime = Date.now()

    for (const [serviceName, state] of this.breakers.entries()) {
      if (state.lastAccessed < oldestTime) {
        oldestTime = state.lastAccessed
        oldestName = serviceName
      }
    }

    if (oldestName) {
      this.breakers.delete(oldestName)
      console.warn(`[CircuitBreaker] Evicted oldest breaker: ${oldestName}`)
    }
  }

  /**
   * Get statistics about circuit breaker usage
   */
  public static getBreakerStats(): {
    total: number
    open: number
    halfOpen: number
    closed: number
    oldestAge: number
    newestAge: number
  } {
    const now = Date.now()
    let open = 0, halfOpen = 0, closed = 0
    let oldestAge = 0, newestAge = 0

    for (const state of this.breakers.values()) {
      switch (state.state) {
        case 'open': open++; break
        case 'half-open': halfOpen++; break
        case 'closed': closed++; break
      }

      const age = now - state.createdAt
      oldestAge = Math.max(oldestAge, age)
      if (newestAge === 0 || age < newestAge) {
        newestAge = age
      }
    }

    return {
      total: this.breakers.size,
      open,
      halfOpen,
      closed,
      oldestAge,
      newestAge
    }
  }

  /**
   * Get memory management limits for monitoring
   */
  public static getLimits(): {
    maxBreakers: number
    warningThreshold: number
    cleanupInterval: number
    maxAge: number
  } {
    return {
      maxBreakers: this.MAX_BREAKERS,
      warningThreshold: this.WARNING_THRESHOLD,
      cleanupInterval: this.CLEANUP_INTERVAL,
      maxAge: this.MAX_AGE
    }
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
