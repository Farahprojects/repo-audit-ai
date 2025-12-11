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

interface AuditJobRequest {
    preflightId: string;
    tier: string;
    priority?: number; // 1-10, default 5
    options?: {
        maxRetries?: number;
    };
}

// Canonical tier mapping
const TIER_MAPPING: Record<string, string> = {
    'lite': 'shape',
    'deep': 'conventions',
    'ultra': 'security',
    'performance': 'performance',
    'security': 'security',
    'shape': 'shape',
    'conventions': 'conventions',
    'supabase_deep_dive': 'supabase_deep_dive',
};

serve(withPerformanceMonitoring(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

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

        // Check for existing active job
        const { data: existingJob } = await supabase
            .from('audit_jobs')
            .select('id, status')
            .eq('preflight_id', preflightId)
            .in('status', ['pending', 'processing'])
            .single();

        if (existingJob) {
            return new Response(
                JSON.stringify({
                    error: 'An audit is already in progress for this repository',
                    existingJobId: existingJob.id,
                    status: existingJob.status
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Insert job into queue (upsert to handle re-runs)
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

        // Trigger immediate processing (non-blocking)
        // This uses the environment variables already configured in Supabase secrets
        fetch(`${supabaseUrl}/functions/v1/audit-job-processor`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trigger: 'immediate',
                job_id: job.id,
                preflight_id: preflightId,
                tier
            })
        }).catch((err) => {
            // Don't fail the request if trigger fails - job will be picked up by cron fallback
            LoggerService.warn('Failed to trigger immediate processing', {
                component: 'AuditJobSubmit',
                jobId: job.id,
                error: err.message
            });
        });

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
