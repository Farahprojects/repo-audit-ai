/**
 * Universal Orchestrator - Edge Function Endpoint
 * 
 * This endpoint exposes the orchestrator with SSE streaming for real-time
 * reasoning visibility.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '@supabase/supabase-js';

// Core orchestrator imports
import { Orchestrator, createOrchestrator } from '../_shared/orchestrator/core/orchestrator.ts';
import { createToolRegistry } from '../_shared/orchestrator/core/tool-registry.ts';
import {
    Task,
    PermissionLevel,
    ReasoningStep,
    THINKING_BUDGETS
} from '../_shared/orchestrator/core/types.ts';

// Tool imports
import { githubTools } from '../_shared/orchestrator/tools/github-tools.ts';
import { dbTools } from '../_shared/orchestrator/tools/db-tools.ts';
import { auditTools } from '../_shared/orchestrator/tools/audit-tools.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// ============================================================================
// Request Types
// ============================================================================

interface OrchestratorRequest {
    task: {
        description: string;
        type?: 'audit' | 'fix' | 'analyze' | 'custom';
        context?: Record<string, unknown>;
    };
    sessionId?: string; // For resuming
    stream?: boolean;   // Enable SSE streaming
    thinkingBudget?: keyof typeof THINKING_BUDGETS | number;
    maxIterations?: number;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;

        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Parse request
        const body: OrchestratorRequest = await req.json();

        if (!body.task?.description) {
            return new Response(
                JSON.stringify({ error: 'Missing task description' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get user from auth header (optional)
        let userId: string | undefined;
        const authHeader = req.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id;
        }

        // Create task object
        const task: Task = {
            id: crypto.randomUUID(),
            description: body.task.description,
            type: body.task.type || 'custom',
            context: body.task.context,
            thinkingBudget: body.thinkingBudget || 'audit',
            maxIterations: body.maxIterations || 50
        };

        // Create tool registry with all available tools
        const toolRegistry = createToolRegistry();
        toolRegistry.registerMany([...githubTools, ...dbTools, ...auditTools]);

        console.log(`[Orchestrator] Starting task: ${task.description}`);
        console.log(`[Orchestrator] Tools available: ${toolRegistry.getToolNames().join(', ')}`);

        // Handle streaming vs non-streaming
        if (body.stream) {
            return handleStreamingRequest(task, supabase, geminiApiKey, userId, toolRegistry);
        } else {
            return handleSyncRequest(task, supabase, geminiApiKey, userId, toolRegistry);
        }

    } catch (error) {
        console.error('[Orchestrator] Error:', error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Internal server error'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// ============================================================================
// Synchronous Request Handler
// ============================================================================

async function handleSyncRequest(
    task: Task,
    supabase: any,
    apiKey: string,
    userId: string | undefined,
    toolRegistry: any
): Promise<Response> {
    const orchestrator = createOrchestrator({
        apiKey,
        maxIterations: task.maxIterations || 50,
        thinkingBudget: task.thinkingBudget || 'audit',
        supabase,
        userId,
        permissions: [PermissionLevel.READ, PermissionLevel.WRITE]
    }, toolRegistry);

    const result = await orchestrator.execute(task);

    return new Response(
        JSON.stringify(result),
        {
            status: result.success ? 200 : 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
    );
}

// ============================================================================
// Streaming (SSE) Request Handler
// ============================================================================

async function handleStreamingRequest(
    task: Task,
    supabase: any,
    apiKey: string,
    userId: string | undefined,
    toolRegistry: any
): Promise<Response> {
    // Create a readable stream for SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
            };

            try {
                // Stream callback for reasoning steps
                const streamCallback = (step: ReasoningStep) => {
                    sendEvent('reasoning', {
                        stepNumber: step.stepNumber,
                        reasoning: step.reasoning,
                        toolCalled: step.toolCalled,
                        timestamp: step.createdAt
                    });
                };

                const orchestrator = createOrchestrator({
                    apiKey,
                    maxIterations: task.maxIterations || 50,
                    thinkingBudget: task.thinkingBudget || 'audit',
                    supabase,
                    userId,
                    permissions: [PermissionLevel.READ, PermissionLevel.WRITE],
                    streamCallback
                }, toolRegistry);

                // Send start event
                sendEvent('start', { taskId: task.id, sessionId: orchestrator.getStateManager().getSessionId() });

                // Execute
                const result = await orchestrator.execute(task);

                // Send completion
                sendEvent('complete', {
                    success: result.success,
                    sessionId: result.sessionId,
                    totalSteps: result.totalSteps,
                    totalTokens: result.totalTokens,
                    finalOutput: result.finalOutput,
                    error: result.error
                });

                controller.close();

            } catch (error) {
                sendEvent('error', {
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}
