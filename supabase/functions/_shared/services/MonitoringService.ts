interface MetricData {
  name: string
  value: number
  tags?: Record<string, string>
  timestamp?: number
}

interface AuditMetrics {
  auditId: string
  duration: number
  tier: string
  success: boolean
  tokensUsed: number
  issuesFound: number
  errorType?: string
}

export class MonitoringService {
  private static metrics: MetricData[] = []

  static recordMetric(name: string, value: number, tags: Record<string, string> = {}) {
    const metric: MetricData = {
      name,
      value,
      tags,
      timestamp: Date.now()
    }

    this.metrics.push(metric)

    // In a real system, you'd send this to a monitoring service like DataDog, New Relic, etc.
    console.log(`METRIC: ${name}=${value}`, tags)
  }

  static recordAuditCompletion(metrics: AuditMetrics) {
    this.recordMetric('audit.duration', metrics.duration, {
      tier: metrics.tier,
      success: metrics.success.toString(),
      auditId: metrics.auditId
    })

    this.recordMetric('audit.tokens_used', metrics.tokensUsed, {
      tier: metrics.tier,
      auditId: metrics.auditId
    })

    this.recordMetric('audit.issues_found', metrics.issuesFound, {
      tier: metrics.tier,
      auditId: metrics.auditId
    })

    if (!metrics.success && metrics.errorType) {
      this.recordMetric('audit.errors', 1, {
        type: metrics.errorType,
        tier: metrics.tier,
        auditId: metrics.auditId
      })
    }
  }

  static recordAPIUsage(service: string, endpoint: string, duration: number, success: boolean) {
    this.recordMetric('api.call_duration', duration, {
      service,
      endpoint,
      success: success.toString()
    })

    this.recordMetric('api.calls', 1, {
      service,
      endpoint,
      success: success.toString()
    })
  }

  static getMetricsSummary(hours: number = 24): Record<string, any> {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000)
    const recentMetrics = this.metrics.filter(m => (m.timestamp || 0) > cutoff)

    const summary: Record<string, any> = {
      totalMetrics: recentMetrics.length,
      timeRange: `${hours} hours`,
      breakdowns: {}
    }

    // Group by metric name
    const grouped = recentMetrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = []
      }
      const metricList = acc[metric.name];
      if (metricList) {
        metricList.push(metric)
      }
      return acc
    }, {} as Record<string, MetricData[]>)

    // Calculate aggregations
    for (const [name, metrics] of Object.entries(grouped)) {
      const values = metrics.map(m => m.value)
      if (!summary['breakdowns']) {
        summary['breakdowns'] = {};
      }
      summary['breakdowns'][name] = {
        count: metrics.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      }
    }

    return summary
  }

  // Health check endpoints
  static getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: Record<string, any>
  } {
    const summary = this.getMetricsSummary(1) // Last hour

    // Check for high error rates
    const breakdowns = summary['breakdowns'] as Record<string, any> || {};
    const errorMetrics = breakdowns['audit.errors'] || { count: 0 }
    const totalAudits = (breakdowns['audit.duration'] || { count: 0 }).count

    const errorRate = totalAudits > 0 ? (errorMetrics.count / totalAudits) * 100 : 0

    // Check for slow response times
    const avgDuration = (summary['breakdowns']['audit.duration'] || { avg: 0 }).avg

    const checks = {
      errorRate: {
        rate: errorRate,
        threshold: 10, // 10% error rate threshold
        status: errorRate > 10 ? 'fail' : 'pass'
      },
      avgAuditDuration: {
        duration: avgDuration,
        threshold: 300000, // 5 minutes threshold
        status: avgDuration > 300000 ? 'fail' : 'pass'
      },
      circuitBreakers: {
        // This would integrate with CircuitBreakerService
        status: 'unknown'
      }
    }

    const failingChecks = Object.values(checks).filter(check =>
      check.status === 'fail'
    ).length

    const status = failingChecks === 0 ? 'healthy' :
      failingChecks === 1 ? 'degraded' : 'unhealthy'

    return { status, checks }
  }
}
