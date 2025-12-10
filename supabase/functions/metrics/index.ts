import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from '@supabase/supabase-js'
import { MonitoringService } from '../_shared/services/MonitoringService.ts'
import { CircuitBreakerService } from '../_shared/services/CircuitBreakerService.ts'

interface MetricsResponse {
  timestamp: string
  period: string
  system: {
    uptime: number
    version: string
    environment: string
  }
  performance: {
    auditMetrics: any
    apiMetrics: any
    errorRates: any
  }
  reliability: {
    circuitBreakers: any
    recentFailures: any
  }
  usage: {
    auditCounts: any
    userActivity: any
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow GET requests for security
  if (req.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get query parameters
    const url = new URL(req.url)
    const period = parseInt(url.searchParams.get('hours') || '24')
    const includeCircuitBreakers = url.searchParams.get('circuit_breakers') === 'true'

    // Collect all metrics
    const [
      auditMetrics,
      apiMetrics,
      auditStats,
      userActivity,
      recentFailures
    ] = await Promise.all([
      MonitoringService.getMetricsSummary(period),
      getAPIMetrics(supabase, period),
      getAuditStats(supabase, period),
      getUserActivity(supabase, period),
      getRecentFailures(supabase, period)
    ])

    const circuitBreakerData = includeCircuitBreakers ?
      CircuitBreakerService.getAllBreakerStatuses() : null

    const response: MetricsResponse = {
      timestamp: new Date().toISOString(),
      period: `${period} hours`,
      system: {
        uptime: Date.now() - (globalThis as any).START_TIME || 0,
        version: '1.0.0',
        environment: Deno.env.get('ENVIRONMENT') || 'production'
      },
      performance: {
        auditMetrics,
        apiMetrics,
        errorRates: calculateErrorRates(auditMetrics, apiMetrics)
      },
      reliability: {
        circuitBreakers: circuitBreakerData,
        recentFailures
      },
      usage: {
        auditCounts: auditStats,
        userActivity
      }
    }

    return new Response(
      JSON.stringify(response, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    )

  } catch (error) {
    console.error('Metrics collection failed:', error)

    return new Response(
      JSON.stringify({
        error: 'Metrics collection failed',
        timestamp: new Date().toISOString(),
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function getAPIMetrics(supabase: any, hours: number): Promise<any> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    // Get API call metrics from audit_status (we can extend this later)
    const { data, error } = await supabase
      .from('audit_status')
      .select('created_at, failed_at, actual_duration_seconds')
      .gte('created_at', cutoff)

    if (error) throw error

    const totalCalls = data?.length || 0
    const failedCalls = data?.filter((a: any) => a.failed_at).length || 0
    const avgDuration = data?.length ?
      data.reduce((sum: number, a: any) => sum + (a.actual_duration_seconds || 0), 0) / data.length : 0

    return {
      totalCalls,
      failedCalls,
      successRate: totalCalls > 0 ? ((totalCalls - failedCalls) / totalCalls) * 100 : 100,
      avgDurationSeconds: Math.round(avgDuration * 100) / 100
    }

  } catch (error) {
    console.error('API metrics collection failed:', error)
    return { error: 'Failed to collect API metrics' }
  }
}

async function getAuditStats(supabase: any, hours: number): Promise<any> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await supabase
      .from('audits')
      .select('tier, created_at, health_score')
      .gte('created_at', cutoff)

    if (error) throw error

    const byTier = (data || []).reduce((acc: any, audit: any) => {
      const tier = audit.tier || 'unknown'
      if (!acc[tier]) acc[tier] = { count: 0, avgHealthScore: 0, scores: [] }
      acc[tier].count++
      if (audit.health_score) {
        acc[tier].scores.push(audit.health_score)
        acc[tier].avgHealthScore = acc[tier].scores.reduce((a: number, b: number) => a + b, 0) / acc[tier].scores.length
      }
      return acc
    }, {} as any)

    return {
      total: data?.length || 0,
      byTier,
      timeRange: `${hours} hours`
    }

  } catch (error) {
    console.error('Audit stats collection failed:', error)
    return { error: 'Failed to collect audit stats' }
  }
}

async function getUserActivity(supabase: any, hours: number): Promise<any> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    // Get active users (those who created audits)
    const { data, error } = await supabase
      .from('audits')
      .select('user_id, created_at')
      .gte('created_at', cutoff)

    if (error) throw error

    const uniqueUsers = new Set(data?.map((a: any) => a.user_id).filter(Boolean))
    const totalAudits = data?.length || 0
    const avgAuditsPerUser = uniqueUsers.size > 0 ? totalAudits / uniqueUsers.size : 0

    return {
      activeUsers: uniqueUsers.size,
      totalAudits,
      avgAuditsPerUser: Math.round(avgAuditsPerUser * 100) / 100,
      timeRange: `${hours} hours`
    }

  } catch (error) {
    console.error('User activity collection failed:', error)
    return { error: 'Failed to collect user activity' }
  }
}

async function getRecentFailures(supabase: any, hours: number): Promise<any> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await supabase
      .from('audit_status')
      .select('error_message, error_details, tier, created_at, failed_at')
      .eq('status', 'failed')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error

    const failures = (data || []).map((failure: any) => ({
      tier: failure.tier,
      error: failure.error_message,
      timestamp: failure.failed_at || failure.created_at,
      details: failure.error_details
    }))

    const byTier = failures.reduce((acc: any, failure: any) => {
      const tier = failure.tier || 'unknown'
      acc[tier] = (acc[tier] || 0) + 1
      return acc
    }, {} as any)

    return {
      recent: failures,
      byTier,
      total: failures.length,
      timeRange: `${hours} hours`
    }

  } catch (error) {
    console.error('Recent failures collection failed:', error)
    return { error: 'Failed to collect recent failures' }
  }
}

function calculateErrorRates(auditMetrics: any, apiMetrics: any): any {
  const auditErrors = auditMetrics.breakdowns?.['audit.errors']?.count || 0
  const totalAudits = auditMetrics.breakdowns?.['audit.duration']?.count || 0

  const apiErrors = apiMetrics.failedCalls || 0
  const totalAPICalls = apiMetrics.totalCalls || 0

  return {
    auditErrorRate: totalAudits > 0 ? (auditErrors / totalAudits) * 100 : 0,
    apiErrorRate: totalAPICalls > 0 ? (apiErrors / totalAPICalls) * 100 : 0,
    overallErrorRate: (totalAudits + totalAPICalls) > 0 ?
      ((auditErrors + apiErrors) / (totalAudits + totalAPICalls)) * 100 : 0
  }
}
