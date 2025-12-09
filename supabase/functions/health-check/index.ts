import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { MonitoringService } from '../_shared/services/MonitoringService.ts'
import { CircuitBreakerService } from '../_shared/services/CircuitBreakerService.ts'

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  checks: {
    database: HealthCheck
    circuitBreakers: HealthCheck
    recentAudits: HealthCheck
    systemResources: HealthCheck
  }
  metrics: any
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn'
  message: string
  details?: any
}

const START_TIME = Date.now()

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Run all health checks
    const checks = await Promise.allSettled([
      checkDatabaseHealth(supabase),
      checkCircuitBreakers(),
      checkRecentAudits(supabase),
      checkSystemResources()
    ])

    // Extract results
    const [dbCheck, cbCheck, auditCheck, resourceCheck] = checks.map(p =>
      p.status === 'fulfilled' ? p.value : {
        status: 'fail' as const,
        message: `Check failed: ${p.reason}`,
        details: { error: String(p.reason) }
      }
    )

    // Determine overall status
    const checkStatuses = [dbCheck.status, cbCheck.status, auditCheck.status, resourceCheck.status]
    const hasFailures = checkStatuses.includes('fail')
    const hasWarnings = checkStatuses.includes('warn')

    const overallStatus = hasFailures ? 'unhealthy' :
                         hasWarnings ? 'degraded' : 'healthy'

    const response: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0', // You might want to read this from package.json or env
      uptime: Date.now() - START_TIME,
      checks: {
        database: dbCheck,
        circuitBreakers: cbCheck,
        recentAudits: auditCheck,
        systemResources: resourceCheck
      },
      metrics: MonitoringService.getMetricsSummary(1) // Last hour
    }

    const statusCode = overallStatus === 'healthy' ? 200 :
                      overallStatus === 'degraded' ? 200 : 503

    return new Response(
      JSON.stringify(response, null, 2),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    )

  } catch (error) {
    console.error('Health check failed:', error)

    const errorResponse: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: Date.now() - START_TIME,
      checks: {
        database: { status: 'fail', message: 'Health check system error' },
        circuitBreakers: { status: 'fail', message: 'Health check system error' },
        recentAudits: { status: 'fail', message: 'Health check system error' },
        systemResources: { status: 'fail', message: 'Health check system error' }
      },
      metrics: null
    }

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function checkDatabaseHealth(supabase: any): Promise<HealthCheck> {
  const startTime = Date.now()

  try {
    // Test basic connectivity
    const { data, error } = await supabase
      .from('audits')
      .select('count', { count: 'exact', head: true })

    if (error) throw error

    const duration = Date.now() - startTime

    // Check for slow queries
    if (duration > 5000) {
      return {
        status: 'warn',
        message: `Database query slow (${duration}ms)`,
        details: { queryTime: duration, recordCount: data }
      }
    }

    return {
      status: 'pass',
      message: `Database healthy (${duration}ms)`,
      details: { queryTime: duration, recordCount: data }
    }

  } catch (error) {
    return {
      status: 'fail',
      message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error), queryTime: Date.now() - startTime }
    }
  }
}

async function checkCircuitBreakers(): Promise<HealthCheck> {
  try {
    const breakerStatuses = CircuitBreakerService.getAllBreakerStatuses()

    const openBreakers = Object.entries(breakerStatuses)
      .filter(([, status]) => status.state === 'open')
      .map(([name]) => name)

    if (openBreakers.length > 0) {
      return {
        status: 'warn',
        message: `Circuit breakers open: ${openBreakers.join(', ')}`,
        details: { openBreakers, allStatuses: breakerStatuses }
      }
    }

    return {
      status: 'pass',
      message: 'All circuit breakers healthy',
      details: { breakerCount: Object.keys(breakerStatuses).length, openBreakers: [] }
    }

  } catch (error) {
    return {
      status: 'fail',
      message: `Circuit breaker check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) }
    }
  }
}

async function checkRecentAudits(supabase: any): Promise<HealthCheck> {
  try {
    // Check recent audit completions and failures
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: recentAudits, error } = await supabase
      .from('audit_status')
      .select('status, created_at, failed_at')
      .gte('created_at', oneHourAgo)

    if (error) throw error

    const total = recentAudits?.length || 0
    const failed = recentAudits?.filter(a => a.status === 'failed').length || 0
    const completed = recentAudits?.filter(a => a.status === 'completed').length || 0

    const failureRate = total > 0 ? (failed / total) * 100 : 0

    // High failure rate indicates problems
    if (failureRate > 20) {
      return {
        status: 'fail',
        message: `High audit failure rate: ${failureRate.toFixed(1)}%`,
        details: { total, completed, failed, failureRate }
      }
    }

    if (failureRate > 10) {
      return {
        status: 'warn',
        message: `Elevated audit failure rate: ${failureRate.toFixed(1)}%`,
        details: { total, completed, failed, failureRate }
      }
    }

    return {
      status: 'pass',
      message: `Audit success rate healthy: ${(100 - failureRate).toFixed(1)}%`,
      details: { total, completed, failed, failureRate }
    }

  } catch (error) {
    return {
      status: 'fail',
      message: `Recent audits check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) }
    }
  }
}

async function checkSystemResources(): Promise<HealthCheck> {
  try {
    // Check Deno-specific metrics
    const memInfo = Deno.memoryUsage?.() || {}
    const systemMemory = {
      rss: memInfo.rss,
      heapTotal: memInfo.heapTotal,
      heapUsed: memInfo.heapUsed,
      external: memInfo.external
    }

    // Warn if heap usage is high (over 500MB)
    const heapUsageMB = (systemMemory.heapUsed || 0) / (1024 * 1024)
    if (heapUsageMB > 500) {
      return {
        status: 'warn',
        message: `High memory usage: ${heapUsageMB.toFixed(1)}MB heap`,
        details: systemMemory
      }
    }

    return {
      status: 'pass',
      message: `Memory usage normal: ${heapUsageMB.toFixed(1)}MB heap`,
      details: systemMemory
    }

  } catch (error) {
    // Memory check might not be available in all environments
    return {
      status: 'pass',
      message: 'System resource check skipped (not available)',
      details: { note: 'Memory usage check not available in this environment' }
    }
  }
}
