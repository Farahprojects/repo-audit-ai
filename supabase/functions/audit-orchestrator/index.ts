import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { RequestValidationService } from '../_shared/services/RequestValidationService.ts'
import { CircuitBreakerService, GitHubCircuitBreaker, AICircuitBreaker } from '../_shared/services/CircuitBreakerService.ts'
import { RetryService, GitHubRetry, AIRetry } from '../_shared/services/RetryService.ts'
import { MonitoringService } from '../_shared/services/MonitoringService.ts'

interface AuditOrchestrationRequest {
  preflightId: string
  tier: string
  userId: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse and validate request
    const body: AuditOrchestrationRequest = await req.json()
    const validation = RequestValidationService.validateAuditOrchestrationRequest(body)

    if (!validation.isValid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { preflightId, tier, userId } = body

    // Update audit status to processing
    const { error: statusError } = await supabase
      .from('audit_status')
      .upsert({
        preflight_id: preflightId,
        user_id: userId,
        status: 'processing',
        progress: 0,
        logs: ['Audit orchestration started']
      })

    if (statusError) {
      console.error('Failed to create audit status:', statusError)
      return new Response(
        JSON.stringify({ error: 'Failed to initialize audit status' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Start orchestration asynchronously (don't wait for completion)
    orchestrateAudit(supabase, preflightId, tier, userId)

    // Return immediate response with status tracking info
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audit orchestration started',
        status: {
          preflightId,
          status: 'processing',
          progress: 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Audit orchestration error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function orchestrateAudit(
  supabase: any,
  preflightId: string,
  tier: string,
  userId: string
) {
  const startTime = Date.now()
  let totalTokensUsed = 0
  let totalIssuesFound = 0

  const updateProgress = async (progress: number, log: string) => {
    const { data: currentLogs } = await supabase
      .from('audit_status')
      .select('logs')
      .eq('preflight_id', preflightId)
      .single()

    const updatedLogs = [...(currentLogs?.logs || []), log]

    await supabase
      .from('audit_status')
      .update({
        progress,
        logs: updatedLogs,
        current_step: log,
        updated_at: new Date().toISOString()
      })
      .eq('preflight_id', preflightId)
  }

  try {
    await updateProgress(2, '[Planner] Analyzing codebase structure...')
    await updateProgress(4, '[Planner] Loading audit requirements...')
    await updateProgress(5, '[Planner] Generating specialized task breakdown...')

    // Phase 1: Planning (with resilience)
    const planStart = Date.now()
    const { data: planResult, error: planError } = await RetryService.executeWithRetry(
      () => AICircuitBreaker.execute(
        () => supabase.functions.invoke('audit-planner', {
          body: { preflightId, tier }
        })
      ),
      { maxAttempts: 2 }
    )

    if (planError) throw planError

    const { plan, tier: canonicalTier, usage: plannerUsage, preflight } = planResult
    const planDuration = Date.now() - planStart

    MonitoringService.recordAPIUsage('ai', 'audit-planner', planDuration, true)
    totalTokensUsed += plannerUsage?.totalTokens || 0

    await updateProgress(15, `[Planner] Plan generated: ${plan.tasks.length} tasks in ${planDuration}ms.`)

    // Phase 2: Execution (Workers) with resilience
    const workerResults = []
    const totalTasks = plan.tasks.length
    let completedTasks = 0

    // Run tasks in parallel with progress updates and circuit breakers
    const taskPromises = plan.tasks.map(async (task: any, index: number) => {
      const taskStart = Date.now()

      try {
        await updateProgress(
          15 + Math.round(((index + 1) / totalTasks) * 10),
          `[Worker ${index + 1}] Starting: ${task.role}`
        )

        // Execute with GitHub circuit breaker for repo access, AI circuit breaker for analysis
        const { data: workerResult, error: workerError } = await RetryService.executeWithRetry(
          () => Promise.all([
            GitHubCircuitBreaker.execute(() => Promise.resolve()), // Placeholder for GitHub calls
            AICircuitBreaker.execute(() => supabase.functions.invoke('audit-worker', {
              body: {
                preflightId,
                taskId: task.id,
                instruction: task.instruction,
                role: task.role,
                targetFiles: task.targetFiles,
                preflight // Pass inline preflight data to avoid N+1 queries
              }
            }))
          ]).then(([, auditResult]) => auditResult),
          { maxAttempts: 2 }
        )

        if (workerError) throw workerError

        const result = workerResult.result
        const taskDuration = Date.now() - taskStart
        MonitoringService.recordAPIUsage('ai', `audit-worker-${task.role}`, taskDuration, true)

        totalTokensUsed += result?.tokenUsage || 0
        totalIssuesFound += result?.issues?.length || 0

        completedTasks++
        const progressPercent = 15 + Math.round((completedTasks / totalTasks) * 70)

        await updateProgress(
          progressPercent,
          `[Worker ${index + 1}] Finished: Found ${result.issues?.length || 0} issues in ${taskDuration}ms.`
        )

        return result
      } catch (err) {
        console.error(`Worker ${index + 1} failed:`, err)
        const taskDuration = Date.now() - taskStart

        MonitoringService.recordAPIUsage('ai', `audit-worker-${task.role}`, taskDuration, false)

        await updateProgress(
          15 + Math.round((completedTasks / totalTasks) * 70),
          `[Worker ${index + 1}] Failed after ${taskDuration}ms: ${err instanceof Error ? err.message : 'Unknown error'}`
        )

        // Return valid structure so synthesis doesn't crash
        return {
          taskId: task.id,
          findings: { error: "Worker Failed", message: String(err) },
          tokenUsage: 0
        }
      }
    })

    const results = await Promise.all(taskPromises)
    workerResults.push(...results)

    await updateProgress(90, `[System] All workers completed. Total tokens used: ${totalTokensUsed}`)

    // Phase 3: Synthesis (with resilience)
    const synthesisStart = Date.now()
    await updateProgress(95, '[Coordinator] Synthesizing results...')

    const { data: synthesisResult, error: synthesisError } = await RetryService.executeWithRetry(
      () => AICircuitBreaker.execute(
        () => supabase.functions.invoke('audit-coordinator', {
          body: {
            preflightId,
            workerResults,
            tier: canonicalTier,
            plannerUsage
          }
        })
      ),
      { maxAttempts: 2 }
    )

    if (synthesisError) throw synthesisError

    const finalReport = synthesisResult
    const synthesisDuration = Date.now() - synthesisStart
    MonitoringService.recordAPIUsage('ai', 'audit-coordinator', synthesisDuration, true)

    const totalDuration = Date.now() - startTime
    await updateProgress(100, `[Coordinator] Synthesis complete in ${synthesisDuration}ms. Found ${finalReport.issues?.length || 0} issues. Health Score: ${finalReport.healthScore}. Total duration: ${totalDuration}ms`)

    // Mark as completed
    await supabase
      .from('audit_status')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
        report_data: finalReport,
        actual_duration_seconds: Math.round(totalDuration / 1000)
      })
      .eq('preflight_id', preflightId)

    // Record success metrics
    MonitoringService.recordAuditCompletion({
      auditId: preflightId,
      duration: totalDuration,
      tier: canonicalTier,
      success: true,
      tokensUsed: totalTokensUsed,
      issuesFound: finalReport.issues?.length || 0
    })

  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error('Orchestration failed:', error)

    const errorType = error instanceof Error ? error.constructor.name : 'Unknown'
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Record failure metrics
    MonitoringService.recordAuditCompletion({
      auditId: preflightId,
      duration: totalDuration,
      tier,
      success: false,
      tokensUsed: totalTokensUsed,
      issuesFound: totalIssuesFound,
      errorType
    })

    await supabase
      .from('audit_status')
      .update({
        status: 'failed',
        error_message: errorMessage,
        error_details: {
          type: errorType,
          stack: error instanceof Error ? error.stack : undefined,
          duration: totalDuration
        },
        failed_at: new Date().toISOString(),
        actual_duration_seconds: Math.round(totalDuration / 1000)
      })
      .eq('preflight_id', preflightId)
  }
}
