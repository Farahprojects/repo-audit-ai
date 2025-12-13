/**
 * Job Recovery Function
 *
 * Manually recover stuck jobs and clean up the queue.
 * Call this when jobs get stuck in processing status.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from '@supabase/supabase-js';
import { LoggerService } from '../_shared/services/LoggerService.ts';

// Initialize Supabase client at global scope to avoid cold start performance issues
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const action = body.action || 'recover';

        let result;

        switch (action) {
            case 'recover':
                // Recover stuck jobs
                const { data: recovered, error: recoverError } = await supabase.rpc('recover_stale_audit_jobs');
                if (recoverError) throw recoverError;

                // Also trigger processing of pending jobs
                const { data: pendingJobs, error: pendingError } = await supabase
                    .from('audit_jobs')
                    .select('id, preflight_id, tier')
                    .eq('status', 'pending')
                    .limit(5);

                if (!pendingError && pendingJobs?.length) {
                    // Trigger processing for pending jobs
                    const triggerPromises = pendingJobs.map(async (job: any) => {
                        try {
                            const response = await fetch(`${supabaseUrl}/functions/v1/audit-job-processor`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${supabaseKey}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    trigger: 'recovery',
                                    job_id: job.id,
                                    preflight_id: job.preflight_id,
                                    tier: job.tier
                                })
                            });
                            return response.ok;
                        } catch (e) {
                            return false;
                        }
                    });

                    await Promise.all(triggerPromises);
                }

                result = {
                    recovered: recovered || 0,
                    pending_triggered: pendingJobs?.length || 0
                };
                break;

            case 'status':
                // Get queue status
                const { data: stats, error: statsError } = await supabase.rpc('get_audit_queue_stats');
                if (statsError) throw statsError;

                const { data: jobs, error: jobsError } = await supabase
                    .from('audit_jobs')
                    .select('id, status, worker_id, created_at, started_at')
                    .order('created_at', { ascending: false })
                    .limit(10);

                result = {
                    stats: stats?.[0] || {},
                    recent_jobs: jobs || []
                };
                break;

            case 'cleanup':
                // Clean up old jobs
                const { data: cleaned, error: cleanupError } = await supabase.rpc('cleanup_old_audit_jobs', { days_old: 7 });
                if (cleanupError) throw cleanupError;

                result = { cleaned: cleaned || 0 };
                break;

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        LoggerService.info('Job recovery completed', {
            component: 'JobRecovery',
            action,
            result
        });

        return new Response(
            JSON.stringify({
                success: true,
                action,
                result,
                timestamp: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        LoggerService.error('Job recovery failed', error as Error, {
            component: 'JobRecovery'
        });

        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Recovery failed',
                timestamp: new Date().toISOString()
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
