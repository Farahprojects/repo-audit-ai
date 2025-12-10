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

// Create filtered file map for planning (reduces 890 files to ~100 for better performance)
function createPlanningFileMap(fullFileMap: any[]): any[] {
  const planningFiles: any[] = [];
  const seenDirs = new Set<string>();

  // Include these file types (audit-relevant source code and configs)
  const includePatterns = [
    /\.(ts|tsx|js|jsx)$/,           // TypeScript/JavaScript
    /\.(py|java|go|rs|php|rb)$/,    // Other programming languages
    /\.(sql|prisma)$/,              // Database schemas
    /^package\.json$/,              // Key dependency configs
    /^tsconfig\.json$/,
    /^next\.config\./,
    /^vite\.config\./,
    /^webpack\.config\./,
    /^docker-compose\.yml$/,
    /^Dockerfile$/,
    /supabase\/config\.toml$/,      // Supabase configs
    /supabase\/.*\.sql$/,           // Supabase migrations/functions
    /\.env/,                        // Environment files
    /schema\.(prisma|json)$/,       // Schema definitions
  ];

  // Exclude these (non-audit-relevant files that bloat the prompt)
  const excludePatterns = [
    /\.md$/, /\.txt$/, /\.lock$/,
    /\.gitignore$/, /\.git/,
    /node_modules/, /dist/, /build/, /\.next/,
    /\.log$/, /\.tmp$/, /\.cache/,
    /coverage/, /\.nyc_output/,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
  ];

  for (const file of fullFileMap) {
    const path = file.path;

    // Skip excluded files
    if (excludePatterns.some(pattern => pattern.test(path))) {
      continue;
    }

    // Include audit-relevant files
    if (includePatterns.some(pattern => pattern.test(path))) {
      planningFiles.push(file);
      continue;
    }

    // Sample approach: Include max 2 representative files per directory
    // This gives structure awareness without including every single file
    const dir = path.split('/').slice(0, -1).join('/');
    const dirKey = `${dir}_${seenDirs.has(dir) ? 'extra' : 'first'}`;

    if (!seenDirs.has(dirKey)) {
      seenDirs.add(dirKey);
      planningFiles.push(file); // Include representative file from each dir
    }
  }

  // Limit to reasonable size for planning (max 100 files)
  // This ensures the prompt stays manageable while giving good coverage
  const limitedFiles = planningFiles.slice(0, 100);

  console.log(`[audit-planner] Filtered ${fullFileMap.length} files down to ${limitedFiles.length} for planning`);
  return limitedFiles;
}

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
        const fullFileMap = preflightRecord.repo_map || [];

        // detectCapabilities needs ALL files for accurate tech stack detection
        const detectedStack = detectCapabilities(fullFileMap);

        // Create filtered file map for planning (reduces prompt size significantly)
        const planningFileMap = createPlanningFileMap(fullFileMap);

        // Build context conditionally to handle exactOptionalPropertyTypes
        // Use filtered map for planning context, but keep full map in preflight for workers
        const context: AuditContext = {
            repoUrl: preflightRecord.repo_url,
            files: planningFileMap.map((f: any) => ({
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
                repo_map: fullFileMap, // Keep FULL map for workers (they need all files)
                stats: preflightRecord.stats,
                fingerprint: preflightRecord.fingerprint,
                is_private: preflightRecord.is_private,
                fetch_strategy: preflightRecord.fetch_strategy,
                token_valid: preflightRecord.token_valid,
                file_count: preflightRecord.file_count,
                github_account_id: preflightRecord.github_account_id
            },
            detectedStack
            // githubToken omitted - not needed for planning (metadata only)
        };

        // Run Planner
        let plan: any;
        let usage: any = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };

        if (tier === 'shape' || tier === 'free') {
            // Free Tier / Shape: Bypass Planner and return static Metadata task
            console.log(`[audit-planner] Generating static plan for ${tier} tier`);
            plan = {
                focusArea: "Metadata & Structure Audit",
                tasks: [
                    {
                        id: `metadata-${Date.now()}`,
                        role: "MetadataAnalyst",
                        instruction: "Perform a structural and metadata analysis of the repository using heuristics. Do not read file contents.",
                        targetFiles: [] // Metadata analyst doesn't need target files
                    }
                ]
            };
        } else {
            // Paid Tiers: Run full Gemini Planner
            const plannerResult = await runPlanner(context, GEMINI_API_KEY, tierPrompt);
            plan = plannerResult.result;
            usage = plannerResult.usage;
        }

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
