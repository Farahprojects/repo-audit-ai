// Worker Agent - Analyzes a single chunk of code (Client-Orchestrated)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runWorker } from '../_shared/agents/worker.ts';
import { AuditContext, WorkerTask } from '../_shared/agents/types.ts';
import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';
import {
    validateRequestBody,
    createSupabaseClient,
    handleCorsPreflight,
    createErrorResponse,
    createSuccessResponse,
    validateSupabaseEnv
} from '../_shared/utils.ts';

const ENV = validateSupabaseEnv({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
});

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return handleCorsPreflight();
    }

    try {
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const supabase = createSupabaseClient(ENV);
        const body = await validateRequestBody(req);

        // New Input Schema for Client Orchestration
        const {
            preflightId,
            taskId,
            instruction,
            role,
            targetFiles,
            preflight: inlinePreflight // Optional: passed from orchestrator to avoid N+1 queries
        } = body;

        // Validate required parameters
        if (!preflightId || !taskId || !instruction || !role || !targetFiles) {
            return createErrorResponse('Missing required parameters: preflightId, taskId, instruction, role, targetFiles', 400);
        }

        // 1. Use inline preflight if provided, otherwise fetch from DB (fallback)
        let preflightRecord = inlinePreflight;
        if (!preflightRecord) {
            console.log(`[audit-worker] No inline preflight provided, fetching from DB (task: ${taskId})`);
            const { data, error: preflightError } = await supabase
                .from('preflights')
                .select('*')
                .eq('id', preflightId)
                .single();

            if (preflightError || !data) {
                console.error(`❌ [audit-worker] Failed to fetch preflight:`, preflightError);
                return createErrorResponse('Invalid or expired preflight ID', 400);
            }
            preflightRecord = data;
        }

        // 2. Resolve GitHub Token (Server-Side)
        let effectiveGitHubToken: string | null = null;
        if (preflightRecord.is_private && preflightRecord.github_account_id) {
            const authenticator = GitHubAuthenticator.getInstance();
            effectiveGitHubToken = await authenticator.getTokenByAccountId(preflightRecord.github_account_id);
        }

        // 3. Construct Minimal Context
        // We only need enough context for the worker to fetch the *specific* files it needs
        // We pass the FULL file map so the worker can validate paths, but content is undefined
        // Build context conditionally to handle exactOptionalPropertyTypes
        const baseContext: AuditContext = {
            repoUrl: preflightRecord.repo_url,
            files: preflightRecord.repo_map.map((f: any) => ({
                path: f.path,
                type: 'file',
                size: f.size,
                // content omitted
                url: f.url
            })),
            tier: 'worker', // Placeholder, not used by worker directly
            preflight: {
                id: preflightRecord.id,
                repo_url: preflightRecord.repo_url,
                owner: preflightRecord.owner,
                repo: preflightRecord.repo,
                default_branch: preflightRecord.default_branch,
                repo_map: preflightRecord.repo_map,
                stats: preflightRecord.stats,
                fingerprint: preflightRecord.fingerprint,
                is_private: preflightRecord.is_private,
                fetch_strategy: preflightRecord.fetch_strategy,
                token_valid: preflightRecord.token_valid,
                file_count: preflightRecord.file_count
            }
        };

        const context: AuditContext = effectiveGitHubToken ?
            { ...baseContext, githubToken: effectiveGitHubToken } :
            baseContext;

        // 4. Construct the Task Object
        const task: WorkerTask = {
            id: taskId,
            role: role,
            instruction: instruction,
            targetFiles: targetFiles
        };

        // 5. Run the Worker
        // This uses the shared logic to:
        // a) Verify files exist in preflight
        // b) Fetch content via GitHub API (using server-side token)
        // c) Call Gemini to analyze
        const { result, usage } = await runWorker(context, task, GEMINI_API_KEY);

        // 6. Return Result
        return createSuccessResponse({
            result,
            usage
        });

    } catch (error) {
        console.error('[audit-worker] Error:', error);
        return createErrorResponse(error, 500);
    }
});
