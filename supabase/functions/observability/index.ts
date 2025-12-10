// Observability API - Real-time System Visibility and Monitoring
// Provides comprehensive runtime monitoring, error tracking, and performance metrics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'
import { LoggerService } from '../_shared/services/LoggerService.ts'
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts'
import { RuntimeMonitoringService } from '../_shared/services/RuntimeMonitoringService.ts'
import { MonitoringService } from '../_shared/services/MonitoringService.ts'

interface ObservabilityResponse {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  data: {
    health?: any;
    metrics?: any;
    errors?: any;
    logs?: any;
    alerts?: any;
    performance?: any;
  };
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
    const url = new URL(req.url)
    const endpoint = url.searchParams.get('endpoint') || 'health'
    const format = url.searchParams.get('format') || 'json'
    const limit = parseInt(url.searchParams.get('limit') || '100')

    let data: any = {}
    let status: ObservabilityResponse['status'] = 'healthy'

    // Route to different observability endpoints
    switch (endpoint) {
      case 'health':
        const healthData = await RuntimeMonitoringService.getHealthStatus()
        data.health = healthData
        status = healthData.status
        break

      case 'metrics':
        data.metrics = RuntimeMonitoringService.getMetrics(limit)
        break

      case 'performance':
        const perfMetrics = await RuntimeMonitoringService.collectMetrics()
        data.performance = perfMetrics
        break

      case 'errors':
        data.errors = ErrorTrackingService.getErrorStats()
        break

      case 'logs':
        const level = url.searchParams.get('level') as any
        if (level) {
          data.logs = LoggerService.getLogsByLevel(level)
        } else {
          data.logs = LoggerService.getRecentLogs(limit)
        }
        break

      case 'alerts':
        const activeOnly = url.searchParams.get('active') === 'true'
        data.alerts = activeOnly
          ? RuntimeMonitoringService.getActiveAlerts()
          : RuntimeMonitoringService.getAlerts(limit)
        break

      case 'correlation':
        const correlationId = url.searchParams.get('id')
        if (correlationId) {
          data.logs = LoggerService.getLogsByCorrelation(correlationId)
        } else {
          return new Response(JSON.stringify({
            error: 'correlation ID required for correlation endpoint'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        break

      case 'monitoring-summary':
        data.monitoring = MonitoringService.getMetricsSummary(24)
        break

      case 'dashboard':
        // Comprehensive dashboard data
        const [health, performance, errors, alerts, monitoring] = await Promise.all([
          RuntimeMonitoringService.getHealthStatus(),
          RuntimeMonitoringService.collectMetrics(),
          ErrorTrackingService.getErrorStats(),
          RuntimeMonitoringService.getActiveAlerts(),
          MonitoringService.getMetricsSummary(1)
        ])

        data.dashboard = {
          health,
          performance,
          errors,
          alerts,
          monitoring,
          timestamp: new Date().toISOString(),
          uptime: (globalThis as any).performance?.now() || Date.now()
        }
        status = health.status
        break

      default:
        return new Response(JSON.stringify({
          error: 'Unknown endpoint',
          available: ['health', 'metrics', 'performance', 'errors', 'logs', 'alerts', 'correlation', 'monitoring-summary', 'dashboard']
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const response: ObservabilityResponse = {
      timestamp: new Date().toISOString(),
      status,
      data
    }

    // Export formats
    let responseBody: string
    let contentType: string

    if (format === 'csv') {
      if (endpoint === 'logs') {
        responseBody = LoggerService.exportLogs('csv')
      } else if (endpoint === 'errors') {
        responseBody = ErrorTrackingService.exportErrors('csv')
      } else if (endpoint === 'metrics') {
        responseBody = RuntimeMonitoringService.exportMetrics('csv')
      } else {
        responseBody = JSON.stringify(response)
      }
      contentType = 'text/csv'
    } else {
      responseBody = JSON.stringify(response, null, 2)
      contentType = 'application/json'
    }

    return new Response(responseBody, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-System-Status': status,
        'X-Response-Time': Date.now().toString()
      }
    })

  } catch (error) {
    console.error('Observability API error:', error)

    // Log the error
    const endpoint = new URL(req.url).searchParams.get('endpoint');
    LoggerService.error('Observability API error', error as Error, {
      component: 'ObservabilityAPI',
      ...(endpoint && { endpoint })
    })

    return new Response(JSON.stringify({
      error: 'Internal observability error',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
