// Audit Planner - Phase 1 of Client-Side Orchestration
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runPlanner } from '../_shared/agents/planner.ts';
import { AuditContext } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../_shared/capabilities.ts';
import {
    validateRequestBody,
    createSupabaseClient,
    handleCorsPreflight,
    createErrorResponse,
    createSuccessResponse,
    validateSupabaseEnv
} from '../_shared/utils.ts';

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
        const { preflightId, tier: rawTier = 'shape' } = body;

        // Validate parameters
        if (!preflightId) {
            return createErrorResponse('Missing required parameter: preflightId', 400);
        }

        const mappedTier = TIER_MAPPING[rawTier];
        if (!mappedTier) {
            return createErrorResponse(`Invalid tier: ${rawTier}`, 400);
        }
        const tier = mappedTier;

        // Fetch Preflight Record
        const { data: preflightRecord, error: preflightError } = await supabase
            .from('preflights')
            .select('*')
            .eq('id', preflightId)
            .single();

        if (preflightError || !preflightRecord) {
            console.error(`❌ [audit-planner] Failed to fetch preflight:`, preflightError);
            return createErrorResponse('Invalid or expired preflight ID', 400);
        }

        // Fetch Tier Prompt
        const { data: promptData, error: promptError } = await supabase
            .from('system_prompts')
            .select('prompt')
            .eq('tier', tier)
            .eq('is_active', true)
            .maybeSingle();

        if (promptError || !promptData) {
            throw new Error(`Failed to load prompt for tier: ${tier}`);
        }
        const tierPrompt = promptData.prompt;

        // Prepare Context using Preflight Data
        const fileMap = preflightRecord.repo_map || [];
        const detectedStack = detectCapabilities(fileMap);

        // Build context conditionally to handle exactOptionalPropertyTypes
        const context: AuditContext = {
            repoUrl: preflightRecord.repo_url,
            files: fileMap.map((f: any) => ({
                path: f.path,
                type: 'file',
                size: f.size,
                url: f.url
                // content omitted - not needed for planning
            })),
            tier,
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
            },
            detectedStack
            // githubToken omitted - not needed for planning (metadata only)
        };

        // Run Planner
        const { result: plan, usage } = await runPlanner(context, GEMINI_API_KEY, tierPrompt);

        // Return the plan along with canonical tier and preflight data for workers (avoids N+1 queries)
        return createSuccessResponse({
            plan,
            tier, // Canonical tier resolved by planner
            detectedStack,
            usage,
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
                file_count: preflightRecord.file_count,
                github_account_id: preflightRecord.github_account_id
            }
        });

    } catch (error) {
        console.error('[audit-planner] Error:', error);
        return createErrorResponse(error, 500);
    }
});
