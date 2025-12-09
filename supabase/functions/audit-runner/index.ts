// @ts-nocheck
// Audit Runner - Orchestration layer for 5-Pass "Magic Analysis" Pipeline
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import Agents
import { runPlanner } from '../_shared/agents/planner.ts';
import { runWorker } from '../_shared/agents/worker.ts';
import { runSynthesizer } from '../_shared/agents/synthesizer.ts';
import { AuditContext, WorkerResult } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../_shared/capabilities.ts';
import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';
import {
  validateRequestBody,
  validateGitHubUrl,
  validateAuditTier,
  validateFilePath,
  ValidationError,
  validateSupabaseEnv,
  createSupabaseClient,
  getOptionalUserId,
  handleCorsPreflight,
  createErrorResponse,
  createSuccessResponse,
  parseGitHubRepo
} from '../_shared/utils.ts';

// Canonical tier mapping - validates and maps frontend tiers
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

const VALID_TIERS = ['shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'];

// Cost estimation formulas - server-side only (mirrors cost-estimator edge function)
interface ComplexityFingerprint {
  file_count: number;
  total_bytes: number;
  token_estimate: number;
  frontend_files: number;
  backend_files: number;
  test_files: number;
  config_files: number;
  sql_files: number;
  has_supabase: boolean;
  api_endpoints_estimated: number;
}

const COST_FORMULAS: Record<string, { baseTokens: number; estimate: (fp: ComplexityFingerprint) => number }> = {
  'shape': {
    baseTokens: 5000,
    estimate: (fp) => 5000 + fp.file_count * 50 + fp.config_files * 200
  },
  'conventions': {
    baseTokens: 20000,
    estimate: (fp) => 20000 + fp.token_estimate * 0.05 + fp.test_files * 500
  },
  'performance': {
    baseTokens: 30000,
    estimate: (fp) => 30000 + fp.frontend_files * 800 + fp.backend_files * 600
  },
  'security': {
    baseTokens: 50000,
    estimate: (fp) => 50000 + fp.sql_files * 3000 + (fp.has_supabase ? 10000 : 0) + fp.api_endpoints_estimated * 1000
  },
  'supabase_deep_dive': {
    baseTokens: 60000,
    estimate: (fp) => 60000 + fp.sql_files * 4000 + fp.backend_files * 1000 + fp.api_endpoints_estimated * 1500
  }
};

// Server-side token estimation function
function calculateServerEstimate(tier: string, files: any[]): number {
  // Build a fingerprint from the file list
  const fingerprint: ComplexityFingerprint = {
    file_count: files.length,
    total_bytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
    token_estimate: Math.round(files.reduce((sum, f) => sum + (f.size || 0), 0) / 4),
    frontend_files: files.filter(f => /\.(tsx?|jsx?|vue|svelte)$/.test(f.path)).length,
    backend_files: files.filter(f => /\.(ts|js)$/.test(f.path) && /(server|api|function|handler)/.test(f.path)).length,
    test_files: files.filter(f => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.path)).length,
    config_files: files.filter(f => /\.(json|ya?ml|toml|env)$/.test(f.path) || /config/.test(f.path)).length,
    sql_files: files.filter(f => /\.sql$/.test(f.path)).length,
    has_supabase: files.some(f => /supabase/.test(f.path)),
    api_endpoints_estimated: files.filter(f => /(api|route|endpoint|handler)/.test(f.path)).length
  };

  const formula = COST_FORMULAS[tier];
  if (!formula) return 50000; // Default fallback

  const estimated = formula.estimate(fingerprint);
  return Math.max(formula.baseTokens, Math.round(estimated));
}

// Normalize LLM output for consistent frontend consumption
function normalizeStrengthsOrIssues(items: any[]): { title: string; detail: string }[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map(item => {
    if (typeof item === 'string') {
      const colonIndex = item.indexOf(':');
      if (colonIndex > 0) {
        return {
          title: item.substring(0, colonIndex).trim(),
          detail: item.substring(colonIndex + 1).trim()
        };
      }
      return { title: item, detail: '' };
    }
    if (item && typeof item === 'object') {
      // Handle title/detail structure
      if (item.title) {
        return { title: item.title, detail: item.detail || item.description || '' };
      }
      // Handle area/description structure (from LLM output)
      if (item.area) {
        return { title: item.area, detail: item.description || '' };
      }
    }
    return { title: String(item), detail: '' };
  });
}

function normalizeRiskLevel(level: any): 'critical' | 'high' | 'medium' | 'low' | null {
  if (!level) return null;
  const normalized = String(level).toLowerCase();
  if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
    return normalized as 'critical' | 'high' | 'medium' | 'low';
  }
  return null;
}

// Environment configuration
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

    // Optional auth - audits can run without authentication for public repos
    const userId = await getOptionalUserId(req, supabase);

    // Validate request body
    const body = await validateRequestBody(req);
    const {
      repoUrl,
      files,
      tier: rawTier = 'security',
      estimatedTokens,
      githubToken,
      // NEW: Preflight support
      preflightId,  // ID of an existing preflight record
      preflight: preflightData  // Or full preflight object passed directly
    } = body;

    // Validate required parameters
    // If preflight is provided, we can extract files from it
    let fileMap = files;
    let preflightRecord = preflightData;

    // If preflightId is provided, fetch the preflight from database
    if (preflightId && !preflightRecord) {
      const { data: fetchedPreflight, error: preflightError } = await supabase
        .from('preflights')
        .select('*')
        .eq('id', preflightId)
        .single();

      if (preflightError || !fetchedPreflight) {
        console.error(`❌ [audit-runner] Failed to fetch preflight:`, preflightError);
        return createErrorResponse('Invalid or expired preflight ID', 400);
      }

      preflightRecord = fetchedPreflight;
    }

    // Extract files from preflight if not provided directly
    if (preflightRecord && (!fileMap || fileMap.length === 0)) {
      fileMap = preflightRecord.repo_map;
    }

    // SERVER-SIDE TOKEN DECRYPTION
    // If we have a preflight with a github_account_id, decrypt the token server-side
    // This eliminates the need for the frontend to handle decrypted tokens
    let serverDecryptedToken: string | null = null;

    if (preflightRecord?.github_account_id && preflightRecord?.is_private) {
      const authenticator = GitHubAuthenticator.getInstance();
      serverDecryptedToken = await authenticator.getTokenByAccountId(preflightRecord.github_account_id);

      if (serverDecryptedToken) {
      } else {
        console.warn(`⚠️ [audit-runner] Failed to decrypt token - private repo files may not be accessible`);
      }
    }

    // Use server-decrypted token, fall back to frontend-provided token (legacy), then null
    const effectiveGitHubToken = serverDecryptedToken || githubToken || null;

    if (!repoUrl || (!fileMap || fileMap.length === 0)) {
      return createErrorResponse('Missing required parameters: repoUrl and files (or preflight)', 400);
    }

    // Validate and map tier - reject invalid tiers
    const mappedTier = TIER_MAPPING[rawTier];
    if (!mappedTier || !VALID_TIERS.includes(mappedTier)) {
      console.warn(`[audit-runner] Rejected invalid tier: ${rawTier}`);
      return createErrorResponse(`Invalid audit tier: ${rawTier}. Valid tiers: ${VALID_TIERS.join(', ')}`, 400);
    }
    const tier = mappedTier;

    // Validate files array
    if (!Array.isArray(fileMap) || fileMap.length === 0) {
      return createErrorResponse('files must be a non-empty array', 400);
    }

    // Validate files array size (prevent DoS)
    if (fileMap.length > 10000) {
      return createErrorResponse('Too many files (max 10,000)', 400);
    }

    // Validate GitHub URL format
    if (!validateGitHubUrl(repoUrl)) {
      return createErrorResponse('Invalid repository URL format. Must be a valid GitHub.com URL.', 400);
    }

    // Validate file objects structure
    for (let i = 0; i < fileMap.length; i++) {
      const file = fileMap[i];
      if (!file || typeof file !== 'object') {
        return createErrorResponse(`Invalid file at index ${i}: must be an object`, 400);
      }

      if (!file.path || typeof file.path !== 'string') {
        return createErrorResponse(`Invalid file path at index ${i}: must be a string`, 400);
      }

      // Validate file path (prevent path traversal)
      if (!validateFilePath(file.path)) {
        return createErrorResponse(`Invalid file path at index ${i}: path traversal not allowed`, 400);
      }

      // Validate file size if present
      if (file.size !== undefined && (typeof file.size !== 'number' || file.size < 0 || file.size > 50 * 1024 * 1024)) {
        return createErrorResponse(`Invalid file size at index ${i}: must be 0-50MB`, 400);
      }
    }

    // SURGICAL VALIDATION: Extract owner/repo from declared repoUrl using canonical parser
    const repoInfo = parseGitHubRepo(repoUrl);
    if (!repoInfo) {
      return createErrorResponse('Could not extract owner/repo from repoUrl', 400);
    }
    const { owner: declaredOwner, repo: declaredRepo } = repoInfo;

    // Build case-insensitive pattern to match owner/repo in file URLs
    const ownerRepoPattern = new RegExp(`/${declaredOwner}/${declaredRepo}/`, 'i');


    // Validate all file URLs are from trusted GitHub domains
    const allowedUrlPatterns = [
      /^https:\/\/raw\.githubusercontent\.com\//,
      /^https:\/\/api\.github\.com\//,
    ];

    // FAIL FAST: Check EVERY file URL matches the declared repository
    for (let i = 0; i < fileMap.length; i++) {
      const f = fileMap[i];
      if (!f.url) continue; // Files without URLs will use path-based fallback in worker
      if (typeof f.url !== 'string') {
        return createErrorResponse(`File at index ${i} has invalid URL type`, 400);
      }

      // Check domain is GitHub
      if (!allowedUrlPatterns.some(pattern => pattern.test(f.url))) {
        console.error(`🚨 SECURITY: Invalid domain in file URL at index ${i}: ${f.url}`);
        return createErrorResponse('Invalid file URL domain. Only GitHub URLs are allowed.', 400);
      }

      // CRITICAL: Check URL contains the declared owner/repo
      if (!ownerRepoPattern.test(f.url)) {
        console.error(`🚨 SECURITY: File URL does not match declared repo!`);
        console.error(`   Declared: ${declaredOwner}/${declaredRepo}`);
        console.error(`   File URL: ${f.url}`);
        return createErrorResponse(
          `Security Error: File URL at index ${i} does not match declared repository. ` +
          `Expected: ${declaredOwner}/${declaredRepo}, Got URL: ${f.url.substring(0, 100)}`,
          400
        );
      }
    }

    // Validate estimatedTokens if provided
    if (estimatedTokens !== undefined && (typeof estimatedTokens !== 'number' || estimatedTokens < 0 || estimatedTokens > 10000000)) {
      return createErrorResponse('Invalid estimatedTokens: must be a positive number <= 10M', 400);
    }

    // Fetch the tierPrompt from the database
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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${'='.repeat(60)}\n`);


    // Initialize Context (Metadata Only)
    // Front-end now sends fileMap (path/size/url), no content

    // Detect Capabilities based on file list
    const detectedStack = detectCapabilities(fileMap);

    const context: AuditContext = {
      repoUrl,
      files: fileMap.map(f => ({
        path: f.path,
        type: 'file',
        size: f.size,
        // Content is explicitly undefined here, agents must fetch it
        content: undefined,
        url: f.url
      })),
      tier,
      // Pass preflight data to agents - single source of truth
      preflight: preflightRecord ? {
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
      } : undefined,
      detectedStack, // Pass to agents if needed, but mainly for response
      githubToken: effectiveGitHubToken // Server-decrypted token (never leaves backend)
    };


    console.log(`\n${'='.repeat(60)}`);
    console.log(`${'='.repeat(60)}\n`);

    // --- SWARM PIPELINE EXECUTION ---

    // 1. MAP PHASE: The Planner (CEO)
    const { result: plan, usage: plannerUsage } = await runPlanner(context, GEMINI_API_KEY, tierPrompt);
    plan.tasks.forEach((t, i) => {
    });

    // 2. WORKER PHASE: The Swarm (Parallel Execution)
    const timeStart = Date.now();

    const workerPromises = plan.tasks.map(async (task) => {
      return runWorker(context, task, GEMINI_API_KEY);
    });

    // Use Promise.allSettled for robust error handling - one worker failure won't lose all results
    const workerOutputs = await Promise.allSettled(workerPromises);

    // Aggregate Results & Token Usage (handle both fulfilled and rejected)
    const swarmResults: WorkerResult[] = [];
    let swarmTokenUsage = 0;
    let failedWorkers = 0;

    workerOutputs.forEach((out, i) => {
      if (out.status === 'fulfilled') {
        swarmResults.push(out.value.result);
        swarmTokenUsage += out.value.usage.totalTokens;
      } else {
        failedWorkers++;
        console.warn(`⚠️ Worker ${i} failed:`, out.reason);
      }
    });

    if (failedWorkers > 0) {
      console.warn(`⚠️ ${failedWorkers}/${workerOutputs.length} workers failed. Continuing with ${swarmResults.length} results.`);
    }


    // 3. REDUCE PHASE: The Synthesizer (Editor)
    const { result: finalReport, usage: synthesizerUsage } = await runSynthesizer(context, swarmResults, GEMINI_API_KEY, tierPrompt);

    const timeEnd = Date.now();
    const durationMs = timeEnd - timeStart;

    // Total Tokens
    const totalTokens = (plannerUsage?.totalTokens || 0) + swarmTokenUsage + (synthesizerUsage?.totalTokens || 0);

    // SERVER-SIDE TOKEN VALIDATION (Phase 4)
    // Calculate estimate server-side, don't trust client-provided value
    const serverEstimatedTokens = calculateServerEstimate(tier, fileMap);
    if (estimatedTokens && Math.abs(estimatedTokens - serverEstimatedTokens) > serverEstimatedTokens * 0.5) {
      console.warn(`⚠️ Large discrepancy between client (${estimatedTokens}) and server (${serverEstimatedTokens}) estimates`);
    }
    // Use server-calculated estimate for credit deduction
    const finalEstimatedTokens = serverEstimatedTokens;

    // --- SAVE TO DB ---

    // Map internal "issues" specific format to general DB format
    const rawIssues = (finalReport?.issues && finalReport.issues.length > 0) ? finalReport.issues : (swarmResults || []);

    const dbIssues = rawIssues.map((issue: any, index: number) => ({
      id: issue.id || `issue-${index}`,
      title: issue.title,
      description: issue.description,
      category: issue.category || 'Security',
      severity: issue.severity || 'warning',
      filePath: issue.filePath || 'Repository-wide',
      lineNumber: issue.line || 0,
      badCode: issue.badCode || issue.snippet || '',
      fixedCode: issue.remediation || '',
      cwe: issue.cwe
    }));

    // NORMALIZE LLM OUTPUT (Phase 3)
    // Normalize data before saving to DB and returning to frontend
    const normalizedTopStrengths = normalizeStrengthsOrIssues(finalReport?.topStrengths || []);
    const normalizedTopWeaknesses = normalizeStrengthsOrIssues(finalReport?.topWeaknesses || []);
    const normalizedRiskLevel = normalizeRiskLevel(finalReport?.riskLevel);


    const { error: insertError } = await supabase.from('audits').insert({
      user_id: userId,
      repo_url: repoUrl,
      tier: tier,
      estimated_tokens: finalEstimatedTokens, // Use server-calculated estimate
      health_score: finalReport?.healthScore || 0,
      summary: finalReport?.summary || "No summary generated.",
      issues: dbIssues,
      total_tokens: totalTokens,
      extra_data: {
        topStrengths: normalizedTopStrengths,
        topWeaknesses: normalizedTopWeaknesses,
        riskLevel: normalizedRiskLevel,
        productionReady: finalReport?.productionReady ?? null,
        categoryAssessments: finalReport?.categoryAssessments || null,
        seniorDeveloperAssessment: finalReport?.seniorDeveloperAssessment || null,
        suspiciousFiles: finalReport?.suspiciousFiles || null,
        overallVerdict: finalReport?.overallVerdict || null,
      }
    });

    if (insertError) {
      console.error('Failed to save audit:', insertError);
    } else {
    }

    // Return Result with NORMALIZED data - frontend doesn't need to transform
    return createSuccessResponse({
      healthScore: finalReport.healthScore,
      summary: finalReport.summary,
      issues: dbIssues,
      riskLevel: normalizedRiskLevel,
      productionReady: finalReport.productionReady,
      topStrengths: normalizedTopStrengths,
      topIssues: normalizedTopWeaknesses, // Already normalized
      suspiciousFiles: finalReport?.suspiciousFiles || null,
      categoryAssessments: finalReport?.categoryAssessments || null,
      seniorDeveloperAssessment: finalReport?.seniorDeveloperAssessment || null,
      overallVerdict: finalReport?.overallVerdict || null,
      meta: {
        planValues: plan,
        swarmCount: swarmResults.length,
        duration: durationMs,
        detectedStack,
        tokenEstimates: {
          client: estimatedTokens || null,
          server: serverEstimatedTokens,
          actual: totalTokens
        }
      }
    });

  } catch (error) {
    console.error('Pipeline Error:', error);
    return createErrorResponse(error, 500);
  }
});
