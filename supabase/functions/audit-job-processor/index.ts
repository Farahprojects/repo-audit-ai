/**
 * Audit Job Processor
 * 
 * This function processes audit jobs from the queue.
 * It can be invoked in two ways:
 * 1. Scheduled via pg_cron (every minute as fallback)
 * 2. Triggered immediately by pg_notify when a job is inserted
 * 
 * The function:
 * 1. Acquires a job atomically (prevents race conditions)
 * 2. Runs the audit pipeline INLINE (no separate HTTP calls):
 *    - Planner: Analyzes codebase and creates tasks
 *    - Workers: Execute tasks in parallel
 *    - Coordinator: Aggregates results and saves to DB
 * 3. Updates audit_status with progress (for real-time UI updates)
 * 4. Marks job as completed or failed
 * 
 * This design eliminates the N+1 HTTP call problem by running everything inline.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runPlanner } from '../_shared/agents/planner.ts';
import { runWorker } from '../_shared/agents/worker.ts';
import { AuditContext, WorkerTask } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../_shared/capabilities.ts';
import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';
import { LoggerService } from '../_shared/services/LoggerService.ts';
import { RuntimeMonitoringService, withPerformanceMonitoring } from '../_shared/services/RuntimeMonitoringService.ts';
import { calculateHealthScore, generateEgoDrivenSummary } from '../_shared/scoringUtils.ts';
import { normalizeStrengthsOrIssues, normalizeRiskLevel } from '../_shared/normalization.ts';

const WORKER_ID = `processor-${crypto.randomUUID().slice(0, 8)}`;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;

interface ProcessorRequest {
    trigger?: 'pg_cron' | 'insert' | 'manual';
    job_id?: string;
    batch_size?: number;
}

serve(withPerformanceMonitoring(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const body: ProcessorRequest = await req.json().catch(() => ({}));
        const batchSize = body.batch_size || 1;

        LoggerService.info('Audit job processor triggered', {
            component: 'AuditJobProcessor',
            workerId: WORKER_ID,
            trigger: body.trigger || 'unknown',
            batchSize
        });

        // Acquire jobs atomically
        const { data: jobs, error: acquireError } = await supabase
            .rpc('acquire_audit_jobs_batch', {
                p_worker_id: WORKER_ID,
                p_batch_size: batchSize
            });

        if (acquireError) {
            LoggerService.error('Failed to acquire jobs', acquireError, {
                component: 'AuditJobProcessor',
                workerId: WORKER_ID
            });
            throw acquireError;
        }

        if (!jobs || jobs.length === 0) {
            return new Response(
                JSON.stringify({ message: 'No jobs available', workerId: WORKER_ID }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        LoggerService.info(`Acquired ${jobs.length} jobs`, {
            component: 'AuditJobProcessor',
            workerId: WORKER_ID,
            jobIds: jobs.map((j: any) => j.job_id)
        });

        // Process each job
        const results = await Promise.all(
            jobs.map((job: any) => processJob(supabase, job))
        );

        return new Response(
            JSON.stringify({
                success: true,
                workerId: WORKER_ID,
                processed: results.length,
                results
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        LoggerService.error('audit-job-processor error', error as Error, {
            component: 'AuditJobProcessor',
            workerId: WORKER_ID
        });
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}, 'audit-job-processor'));

/**
 * Process a single audit job
 */
async function processJob(
    supabase: SupabaseClient,
    job: { job_id: string; preflight_id: string; user_id: string; tier: string; input_data: any }
): Promise<{ jobId: string; success: boolean; auditId?: string; error?: string }> {

    const startTime = Date.now();
    let totalTokensUsed = 0;

    // Helper to update progress
    const updateProgress = async (progress: number, log: string, extras: Partial<{
        status: string;
        plan_data: any;
        worker_progress: any[];
        token_usage: any;
        report_data: any;
        error_message: string;
        completed_at: string;
        failed_at: string;
    }> = {}) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${log}`;

        const { data: current } = await supabase
            .from('audit_status')
            .select('logs')
            .eq('preflight_id', job.preflight_id)
            .single();

        await supabase
            .from('audit_status')
            .update({
                progress,
                current_step: log,
                logs: [...(current?.logs || []), logEntry],
                updated_at: timestamp,
                ...extras
            })
            .eq('preflight_id', job.preflight_id);
    };

    try {
        LoggerService.info('Processing job', {
            component: 'AuditJobProcessor',
            jobId: job.job_id,
            preflightId: job.preflight_id,
            tier: job.tier
        });

        await updateProgress(5, 'Job acquired, fetching preflight data...', { status: 'processing' });

        // 1. Fetch preflight data
        const { data: preflight, error: preflightError } = await supabase
            .from('preflights')
            .select('*')
            .eq('id', job.preflight_id)
            .single();

        if (preflightError || !preflight) {
            throw new Error(`Preflight not found: ${job.preflight_id}`);
        }

        // 2. Fetch tier prompt
        const { data: promptData } = await supabase
            .from('system_prompts')
            .select('prompt')
            .eq('tier', job.tier)
            .eq('is_active', true)
            .maybeSingle();

        const tierPrompt = promptData?.prompt || job.tier;

        await updateProgress(10, 'Analyzing codebase structure...');

        // 3. Prepare context
        const fileMap = preflight.repo_map || [];
        const detectedStack = detectCapabilities(fileMap);

        // Resolve GitHub token if needed
        let effectiveGitHubToken: string | null = null;
        if (preflight.is_private && preflight.github_account_id) {
            const authenticator = GitHubAuthenticator.getInstance();
            effectiveGitHubToken = await authenticator.getTokenByAccountId(preflight.github_account_id);
        }

        const baseContext: AuditContext = {
            repoUrl: preflight.repo_url,
            files: fileMap.map((f: any) => ({
                path: f.path,
                type: 'file' as const,
                size: f.size,
                url: f.url
            })),
            tier: job.tier,
            preflight: {
                id: preflight.id,
                repo_url: preflight.repo_url,
                owner: preflight.owner,
                repo: preflight.repo,
                default_branch: preflight.default_branch,
                repo_map: preflight.repo_map,
                stats: preflight.stats,
                fingerprint: preflight.fingerprint,
                is_private: preflight.is_private,
                fetch_strategy: preflight.fetch_strategy,
                token_valid: preflight.token_valid,
                file_count: preflight.file_count
            },
            detectedStack
        };

        const context: AuditContext = effectiveGitHubToken
            ? { ...baseContext, githubToken: effectiveGitHubToken }
            : baseContext;

        // ============================================================
        // PHASE 1: PLANNER (INLINE)
        // ============================================================
        await updateProgress(15, 'Running planner - generating task breakdown...');

        const { result: plan, usage: plannerUsage } = await runPlanner(context, GEMINI_API_KEY, tierPrompt);
        totalTokensUsed += plannerUsage?.totalTokens || 0;

        await updateProgress(25, `Planner complete: ${plan.tasks.length} tasks generated`, {
            plan_data: plan,
            token_usage: { planner: plannerUsage?.totalTokens || 0, workers: 0, coordinator: 0 }
        });

        LoggerService.info('Planner completed', {
            component: 'AuditJobProcessor',
            jobId: job.job_id,
            taskCount: plan.tasks.length,
            plannerTokens: plannerUsage?.totalTokens || 0
        });

        // ============================================================
        // PHASE 2: WORKERS (INLINE, PARALLEL)
        // ============================================================
        const totalTasks = plan.tasks.length;
        const workerProgress: any[] = [];

        const workerPromises = plan.tasks.map(async (task: any, index: number) => {
            const taskStartTime = Date.now();
            const taskProgress = {
                taskId: task.id,
                role: task.role,
                status: 'running',
                startedAt: new Date().toISOString(),
                completedAt: null as string | null,
                issueCount: 0,
                tokenUsage: 0,
                error: null as string | null
            };
            workerProgress.push(taskProgress);

            try {
                // Create worker task
                const workerTask: WorkerTask = {
                    id: task.id,
                    role: task.role,
                    instruction: task.instruction,
                    targetFiles: task.targetFiles
                };

                // Run worker inline
                const { result, usage } = await runWorker(context, workerTask, GEMINI_API_KEY);

                taskProgress.status = 'completed';
                taskProgress.completedAt = new Date().toISOString();
                taskProgress.issueCount = result.findings?.issues?.length || 0;
                taskProgress.tokenUsage = usage?.totalTokens || 0;

                // Update progress periodically
                const progressPercent = 25 + ((index + 1) / totalTasks) * 55;
                await updateProgress(
                    Math.round(progressPercent),
                    `Worker ${index + 1}/${totalTasks}: ${task.role} - found ${taskProgress.issueCount} issues`,
                    { worker_progress: workerProgress }
                );

                return {
                    taskId: task.id,
                    role: task.role,
                    findings: result.findings || {},
                    tokenUsage: usage?.totalTokens || 0,
                    issues: result.findings?.issues || [],
                    duration: Date.now() - taskStartTime
                };

            } catch (err) {
                taskProgress.status = 'failed';
                taskProgress.completedAt = new Date().toISOString();
                taskProgress.error = err instanceof Error ? err.message : String(err);

                LoggerService.warn(`Worker failed: ${task.role}`, {
                    component: 'AuditJobProcessor',
                    jobId: job.job_id,
                    taskId: task.id,
                    error: taskProgress.error
                });

                return {
                    taskId: task.id,
                    role: task.role,
                    findings: { error: taskProgress.error },
                    tokenUsage: 0,
                    issues: [],
                    duration: Date.now() - taskStartTime
                };
            }
        });

        const workerResults = await Promise.all(workerPromises);
        const workerTokens = workerResults.reduce((sum, r) => sum + (r.tokenUsage || 0), 0);
        totalTokensUsed += workerTokens;

        await updateProgress(85, `All ${totalTasks} workers completed`, {
            worker_progress: workerProgress,
            token_usage: { planner: plannerUsage?.totalTokens || 0, workers: workerTokens, coordinator: 0 }
        });

        LoggerService.info('Workers completed', {
            component: 'AuditJobProcessor',
            jobId: job.job_id,
            totalWorkers: totalTasks,
            totalWorkerTokens: workerTokens
        });

        // ============================================================
        // PHASE 3: COORDINATOR (INLINE, DETERMINISTIC)
        // ============================================================
        await updateProgress(90, 'Synthesizing results...');

        // Aggregate issues
        const allIssues = workerResults.flatMap(r => r.findings?.issues || []);
        const uniqueIssuesMap = new Map<string, any>();
        allIssues.forEach((issue: any) => {
            const key = `${issue.title}-${issue.filePath}`;
            if (!uniqueIssuesMap.has(key)) {
                uniqueIssuesMap.set(key, issue);
            }
        });
        const minimizedIssues = Array.from(uniqueIssuesMap.values());

        // Calculate health score
        const healthScore = calculateHealthScore({
            issues: minimizedIssues,
            fileCount: fileMap.length
        });

        // Generate summary
        const summary = generateEgoDrivenSummary(minimizedIssues);

        // Determine risk level
        let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (healthScore < 50) riskLevel = 'critical';
        else if (healthScore < 70) riskLevel = 'high';
        else if (healthScore < 85) riskLevel = 'medium';

        // Aggregate strengths/weaknesses
        const allStrengths = workerResults.flatMap(r => r.findings?.strengths || []);
        const allWeaknesses = workerResults.flatMap(r => r.findings?.weaknesses || []);
        const topStrengths = normalizeStrengthsOrIssues([...new Set(allStrengths)].slice(0, 5));
        const topWeaknesses = normalizeStrengthsOrIssues([...new Set(allWeaknesses)].slice(0, 5));

        // Normalize issues for DB
        const dbIssues = minimizedIssues.map((issue: any, index: number) => ({
            id: issue.id || `issue-${index}`,
            title: issue.title,
            description: issue.description,
            category: issue.category || 'General',
            severity: issue.severity || 'warning',
            filePath: issue.filePath || 'Repository-wide',
            lineNumber: issue.line || 0,
            badCode: issue.badCode || issue.snippet || '',
            fixedCode: issue.remediation || '',
            cwe: issue.cwe
        }));

        await updateProgress(95, 'Saving audit results...');

        // Save to audits table
        const { data: audit, error: auditError } = await supabase
            .from('audits')
            .insert({
                user_id: job.user_id,
                repo_url: preflight.repo_url,
                tier: job.tier,
                health_score: healthScore,
                summary,
                issues: dbIssues,
                total_tokens: totalTokensUsed,
                extra_data: {
                    topStrengths,
                    topWeaknesses,
                    riskLevel: normalizeRiskLevel(riskLevel),
                    productionReady: healthScore > 80,
                    detectedStack,
                    tokenBreakdown: {
                        planner: plannerUsage?.totalTokens || 0,
                        workers: workerTokens,
                        coordinator: 0
                    },
                    processingTime: Date.now() - startTime,
                    workerId: WORKER_ID
                }
            })
            .select()
            .single();

        if (auditError) {
            LoggerService.error('Failed to save audit', auditError, {
                component: 'AuditJobProcessor',
                jobId: job.job_id
            });
        }

        // Complete the job
        await supabase.rpc('complete_audit_job', {
            p_job_id: job.job_id,
            p_output_data: {
                auditId: audit?.id,
                healthScore,
                issueCount: dbIssues.length,
                totalTokens: totalTokensUsed,
                processingTime: Date.now() - startTime
            }
        });

        // Final status update
        const reportData = {
            repoName: `${preflight.owner}/${preflight.repo}`,
            healthScore,
            summary,
            issues: dbIssues,
            riskLevel: normalizeRiskLevel(riskLevel),
            productionReady: healthScore > 80,
            topStrengths,
            topIssues: topWeaknesses,
            auditId: audit?.id,
            meta: {
                detectedStack,
                totalTokens: totalTokensUsed,
                processingTime: Date.now() - startTime
            }
        };

        await updateProgress(100, 'Audit complete!', {
            status: 'completed',
            report_data: reportData,
            completed_at: new Date().toISOString(),
            token_usage: {
                planner: plannerUsage?.totalTokens || 0,
                workers: workerTokens,
                coordinator: 0
            }
        });

        LoggerService.info('Job completed successfully', {
            component: 'AuditJobProcessor',
            jobId: job.job_id,
            auditId: audit?.id,
            healthScore,
            issueCount: dbIssues.length,
            totalTokens: totalTokensUsed,
            processingTime: Date.now() - startTime
        });

        return {
            jobId: job.job_id,
            success: true,
            auditId: audit?.id
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        LoggerService.error('Job failed', error as Error, {
            component: 'AuditJobProcessor',
            jobId: job.job_id,
            preflightId: job.preflight_id
        });

        // Mark job as failed
        await supabase.rpc('fail_audit_job', {
            p_job_id: job.job_id,
            p_error: errorMessage,
            p_error_stack: errorStack
        });

        // Update status
        await updateProgress(0, `Error: ${errorMessage}`, {
            status: 'failed',
            error_message: errorMessage,
            failed_at: new Date().toISOString()
        });

        return {
            jobId: job.job_id,
            success: false,
            error: errorMessage
        };
    }
}
