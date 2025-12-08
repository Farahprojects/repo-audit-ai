// @ts-nocheck
// Audit Runner - Orchestration layer for 5-Pass "Magic Analysis" Pipeline
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import Agents
// Import Agents
import { runPlanner } from '../_shared/agents/planner.ts';
import { runWorker } from '../_shared/agents/worker.ts';
import { runSynthesizer } from '../_shared/agents/synthesizer.ts';
import { AuditContext, WorkerResult } from '../_shared/agents/types.ts';
import { detectCapabilities } from './capabilities.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const ENV = {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ENV.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const supabase = createClient(ENV.SUPABASE_URL!, ENV.SUPABASE_SERVICE_ROLE_KEY!);

    // Auth Check
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { repoUrl, files, tier: rawTier = 'security', estimatedTokens } = await req.json();

    // Validate and map tier - reject invalid tiers
    const mappedTier = TIER_MAPPING[rawTier];
    if (!mappedTier || !VALID_TIERS.includes(mappedTier)) {
      console.warn(`[audit-runner] Rejected invalid tier: ${rawTier}`);
      return new Response(
        JSON.stringify({ error: `Invalid audit tier: ${rawTier}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const tier = mappedTier;

    if (!repoUrl || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate repoUrl format (must be a valid GitHub URL)
    const githubUrlPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
    if (!githubUrlPattern.test(repoUrl)) {
      return new Response(
        JSON.stringify({ error: 'Invalid repository URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate all file URLs are from trusted GitHub domains
    const allowedUrlPatterns = [
      /^https:\/\/raw\.githubusercontent\.com\//,
      /^https:\/\/api\.github\.com\//,
    ];

    const invalidFiles = files.filter((f: any) => {
      if (!f.url) return false; // Files without URLs will be fetched later
      return !allowedUrlPatterns.some(pattern => pattern.test(f.url));
    });

    if (invalidFiles.length > 0) {
      console.warn(`Blocked request with invalid file URLs: ${invalidFiles.map((f: any) => f.url).join(', ')}`);
      return new Response(
        JSON.stringify({ error: 'Invalid file URLs detected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    console.log(`🚀 STARTING 5-PASS MAGIC ANALYSIS`);
    console.log(`📁 Repo: ${repoUrl}`);
    console.log(`📄 Files: ${files.length}`);
    console.log(`${'='.repeat(60)}\n`);


    // Initialize Context (Metadata Only)
    // Front-end now sends fileMap (path/size/url), no content

    // Detect Capabilities based on file list
    const detectedStack = detectCapabilities(files);
    console.log('🕵️ Detected Stack:', detectedStack);

    const context: AuditContext = {
      repoUrl,
      files: files.map(f => ({
        path: f.path,
        type: 'file',
        size: f.size,
        // Content is explicitly undefined here, agents must fetch it
        content: undefined,
        url: f.url
      })),
      tier,
      detectedStack // Pass to agents if needed, but mainly for response
    };


    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 STARTING "CEO BRAIN" AUDIT`);
    console.log(`📁 Repo: ${repoUrl}`);
    console.log(`🗺️ File Map Size: ${files.length} entries`);
    console.log(`${'='.repeat(60)}\n`);

    // --- SWARM PIPELINE EXECUTION ---

    // 1. MAP PHASE: The Planner (CEO)
    const { result: plan, usage: plannerUsage } = await runPlanner(context, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`🧠 CEO BRAIN PLAN: Focus on ${plan.focusArea}`);
    console.log(`📋 Generated ${plan.tasks.length} Worker Assignments:`);
    plan.tasks.forEach((t, i) => {
      console.log(`   ${i + 1}. [${t.role}] 🎯 Goal: "${t.instruction.slice(0, 80)}..." (Files: ${t.targetFiles?.length || 0})`);
    });

    // 2. WORKER PHASE: The Swarm (Parallel Execution)
    const timeStart = Date.now();
    console.log(`\n🚀 releasing the swarm...`);

    const workerPromises = plan.tasks.map(async (task) => {
      return runWorker(context, task, ENV.GEMINI_API_KEY);
    });

    const workerOutputs = await Promise.all(workerPromises);

    // Aggregate Results & Token Usage
    const swarmResults: WorkerResult[] = [];
    let swarmTokenUsage = 0;

    workerOutputs.forEach(out => {
      swarmResults.push(out.result);
      swarmTokenUsage += out.usage.totalTokens;
    });

    console.log(`✅ Swarm Complete. Collected ${swarmResults.length} findings.`);

    // 3. REDUCE PHASE: The Synthesizer (Editor)
    const { result: finalReport, usage: synthesizerUsage } = await runSynthesizer(context, swarmResults, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`📝 Final Report Generated. Health Score: ${finalReport.healthScore}`);

    const timeEnd = Date.now();
    const durationMs = timeEnd - timeStart;

    // Total Tokens
    const totalTokens = (plannerUsage?.totalTokens || 0) + swarmTokenUsage + (synthesizerUsage?.totalTokens || 0);

    // SERVER-SIDE TOKEN VALIDATION (Phase 4)
    // Calculate estimate server-side, don't trust client-provided value
    const serverEstimatedTokens = calculateServerEstimate(tier, files);
    console.log(`📊 Token Estimates - Client: ${estimatedTokens || 'N/A'}, Server: ${serverEstimatedTokens}`);
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

    console.log(`💾 Saving ${dbIssues.length} issues to DB...`);
    console.log(`💰 Total Tokens Used: ${totalTokens}`);

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
      console.log('💾 Audit saved to DB');
    }

    // Return Result with NORMALIZED data - frontend doesn't need to transform
    return new Response(
      JSON.stringify({
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
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Pipeline Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
