/**
 * Audit Job Submit
 * 
 * This is the ONLY entry point for starting an audit.
 * It validates the request, inserts a job into the queue, and returns immediately.
 * The actual processing happens in audit-job-processor (triggered by pg_cron or pg_notify).
 * 
 * Flow:
 * 1. Validate user authentication
 * 2. Validate preflight exists and belongs to user
 * 3. Insert job into audit_jobs queue
 * 4. Initialize audit_status for real-time updates
 * 5. Return immediately with job ID
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from '@supabase/supabase-js';
import { LoggerService } from '../_shared/services/LoggerService.ts';
import { RuntimeMonitoringService, withPerformanceMonitoring } from '../_shared/services/RuntimeMonitoringService.ts';

// Declare Deno global for Supabase Edge Functions
declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

// Declare EdgeRuntime global for Deno/Supabase Edge Functions
declare const EdgeRuntime: {
    waitUntil: (promise: Promise<any>) => void;
};

// Initialize Supabase client at global scope to avoid cold start performance issues
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);


// Trigger job processing with retry and busy handling
async function triggerJobProcessing(supabaseUrl: string, supabaseKey: string, jobId: string, preflightId: string, tier: string) {
    // Small delay to batch rapid submissions (prevents overwhelming the system)
    await new Promise(resolve => setTimeout(resolve, 50));

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(`${supabaseUrl}/functions/v1/audit-job-processor`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    trigger: 'immediate',
                    job_id: jobId,
                    preflight_id: preflightId,
                    tier,
                    attempt: attempt + 1
                })
            });

            if (response.ok) {
                LoggerService.info('Job processing triggered successfully', {
                    component: 'AuditJobSubmit',
                    jobId,
                    attempt: attempt + 1
                });
                return;
            }

            // If busy (429) or server error (5xx), retry with backoff
            if (response.status === 429 || response.status >= 500) {
                attempt++;
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    LoggerService.warn(`Trigger attempt ${attempt} failed, retrying in ${delay}ms`, {
                        component: 'AuditJobSubmit',
                        jobId,
                        status: response.status
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }

            // Other errors - log and give up
            LoggerService.warn('Failed to trigger job processing', {
                component: 'AuditJobSubmit',
                jobId,
                status: response.status,
                attempt: attempt + 1
            });
            break;

        } catch (error) {
            attempt++;
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                LoggerService.warn(`Trigger attempt ${attempt} failed with exception, retrying in ${delay}ms`, {
                    component: 'AuditJobSubmit',
                    jobId,
                    error: error instanceof Error ? error.message : String(error)
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            LoggerService.error('All trigger attempts failed', error as Error, {
                component: 'AuditJobSubmit',
                jobId,
                attempts: attempt
            });
            break;
        }
    }
}

interface AuditJobRequest {
    preflightId: string;
    tier: string;
    priority?: number; // 1-10, default 5
    options?: {
        maxRetries?: number;
    };
}

// Import shared tier mapping
import { TIER_MAPPING } from '../_shared/costEstimation.ts';

serve(withPerformanceMonitoring(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {

        // Get user from JWT
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Authorization header required' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (authError || !user) {
            LoggerService.warn('Unauthorized audit job submission attempt', {
                component: 'AuditJobSubmit',
                error: authError?.message
            });
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse and validate request
        const body: AuditJobRequest = await req.json();
        const { preflightId, tier: rawTier, priority = 5, options = {} } = body;

        if (!preflightId || !rawTier) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: preflightId, tier' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Map tier to canonical name
        const tier = TIER_MAPPING[rawTier];
        if (!tier) {
            return new Response(
                JSON.stringify({ error: `Invalid tier: ${rawTier}. Valid tiers: ${Object.keys(TIER_MAPPING).join(', ')}` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify preflight exists
        const { data: preflight, error: preflightError } = await supabase
            .from('preflights')
            .select('id, user_id, repo_url, owner, repo')
            .eq('id', preflightId)
            .single();

        if (preflightError || !preflight) {
            LoggerService.warn('Invalid preflight ID submitted', {
                component: 'AuditJobSubmit',
                preflightId,
                userId: user.id,
                error: preflightError?.message
            });
            return new Response(
                JSON.stringify({ error: 'Invalid or expired preflight ID' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check if user owns the preflight (or preflight is for public repo)
        if (preflight.user_id && preflight.user_id !== user.id) {
            return new Response(
                JSON.stringify({ error: 'You do not have permission to audit this repository' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check for existing RECENT active job (ignore stale jobs)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existingJob } = await supabase
            .from('audit_jobs')
            .select('id, status, created_at')
            .eq('preflight_id', preflightId)
            .in('status', ['pending', 'processing'])
            .gt('created_at', tenMinutesAgo) // Only block if job is recent
            .single();

        if (existingJob) {
            LoggerService.warn('Audit blocked by existing job', {
                component: 'AuditJobSubmit',
                existingJobId: existingJob.id,
                existingStatus: existingJob.status,
                preflightId,
                userId: user.id
            });
            return new Response(
                JSON.stringify({
                    error: 'An audit is already in progress for this repository',
                    existingJobId: existingJob.id,
                    status: existingJob.status
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // CRITICAL: Force sync repository BEFORE every audit
        // This ensures we always audit the latest code, not stale cached data
        LoggerService.info('Syncing repository before audit', {
            component: 'AuditJobSubmit',
            preflightId,
            owner: preflight.owner,
            repo: preflight.repo
        });

        const { RepoStorageService } = await import('../_shared/services/RepoStorageService.ts');
        const storageService = new RepoStorageService(supabase);

        // Get default branch from preflight
        const { data: preflightDetails } = await supabase
            .from('preflights')
            .select('default_branch')
            .eq('id', preflightId)
            .single();

        const syncResult = await storageService.syncRepo(
            preflight.owner,       // Just owner/repo - stable key used internally
            preflight.repo,
            preflightDetails?.default_branch || 'main'
            // SECURITY: Token retrieved internally from github_account_id
        );

        if (!syncResult.synced && syncResult.error) {
            // FAIL-FAST: Don't allow audit on stale data
            LoggerService.error('Repository sync failed before audit', new Error(syncResult.error), {
                component: 'AuditJobSubmit',
                preflightId,
                owner: preflight.owner,
                repo: preflight.repo
            });
            return new Response(
                JSON.stringify({
                    error: 'Failed to sync repository with GitHub. Cannot audit stale data.',
                    details: syncResult.error
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        LoggerService.info('Repository synced successfully before audit', {
            component: 'AuditJobSubmit',
            preflightId,
            changes: syncResult.changes,
            filesUpdated: syncResult.changes
        });

        // Insert job into queue (upsert to handle re-runs)
        // CRITICAL: Reset ALL state fields to allow re-runs to work properly
        const { data: job, error: insertError } = await supabase
            .from('audit_jobs')
            .upsert({
                preflight_id: preflightId,
                user_id: user.id,
                tier,
                priority: Math.min(10, Math.max(1, priority)),
                status: 'pending',
                scheduled_at: new Date().toISOString(),
                max_attempts: options.maxRetries || 3,
                // Reset state fields for re-runs
                attempts: 0,
                started_at: null,
                completed_at: null,
                worker_id: null,
                locked_until: null,
                last_error: null,
                error_stack: null,
                output_data: null,
                input_data: {
                    tier,
                    submittedAt: new Date().toISOString()
                }
            }, {
                onConflict: 'preflight_id',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (insertError) {
            LoggerService.error('Failed to insert audit job', insertError, {
                component: 'AuditJobSubmit',
                preflightId,
                userId: user.id
            });
            return new Response(
                JSON.stringify({ error: 'Failed to queue audit job', details: insertError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Initialize/update audit_status for real-time updates
        await supabase
            .from('audit_status')
            .upsert({
                preflight_id: preflightId,
                user_id: user.id,
                job_id: job.id,
                tier,
                status: 'queued',
                progress: 0,
                logs: [`[${new Date().toISOString()}] Job queued for processing`],
                current_step: 'Waiting in queue...',
                worker_progress: [],
                token_usage: { planner: 0, workers: 0, coordinator: 0 }
            }, {
                onConflict: 'preflight_id'
            });

        const duration = Date.now() - startTime;

        LoggerService.info('Audit job submitted successfully', {
            component: 'AuditJobSubmit',
            jobId: job.id,
            preflightId,
            tier,
            userId: user.id,
            duration
        });

        // Trigger immediate processing with retry and fallback (using waitUntil to ensure it runs)
        if (typeof EdgeRuntime !== 'undefined') {
            EdgeRuntime.waitUntil(
                triggerJobProcessing(supabaseUrl, supabaseKey, job.id, preflightId, tier)
            );
        } else {
            // Fallback for local testing/non-edge environments
            triggerJobProcessing(supabaseUrl, supabaseKey, job.id, preflightId, tier);
        }

        // Return immediately with job ID
        return new Response(
            JSON.stringify({
                success: true,
                jobId: job.id,
                preflightId,
                tier,
                status: 'queued',
                message: 'Audit job queued successfully. Processing started immediately.',
                repoInfo: {
                    owner: preflight.owner,
                    repo: preflight.repo,
                    url: preflight.repo_url
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        LoggerService.error('audit-job-submit error', error as Error, {
            component: 'AuditJobSubmit'
        });
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}, 'audit-job-submit'));
