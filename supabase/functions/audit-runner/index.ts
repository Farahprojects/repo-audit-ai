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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { repoUrl, files, tier = 'security', estimatedTokens } = await req.json();

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
      tier
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

    // --- SAVE TO DB ---

    // Map internal "issues" specific format to general DB format
    // The Enricher/Synthesizer should return compatible issues, but let's standardise
    // We use the "issues" from finalReport which are filtered/prioritised

    // Fallback: If Synthesizer dropped everything, maybe rely on Enricher?
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



    console.log(`💾 Saving ${dbIssues.length} issues to DB...`);

    console.log(`💰 Total Tokens Used: ${totalTokens}`);

    const { error: insertError } = await supabase.from('audits').insert({
      user_id: userId,
      repo_url: repoUrl,
      tier: tier,
      estimated_tokens: estimatedTokens,
      health_score: finalReport?.healthScore || 0,
      summary: finalReport?.summary || "No summary generated.",
      issues: dbIssues,
      total_tokens: totalTokens,
      extra_data: {
        topStrengths: finalReport?.topStrengths || [],
        topWeaknesses: finalReport?.topWeaknesses || [],
        riskLevel: finalReport?.riskLevel || null,
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

    // Return Result
    return new Response(
      JSON.stringify({
        healthScore: finalReport.healthScore,
        summary: finalReport.summary,
        issues: dbIssues,
        riskLevel: finalReport.riskLevel,
        productionReady: finalReport.productionReady,
        meta: {
          planValues: plan,
          swarmCount: swarmResults.length,
          duration: durationMs
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
