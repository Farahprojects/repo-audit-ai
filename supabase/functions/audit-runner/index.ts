// @ts-nocheck
// Audit Runner - Orchestration layer for 5-Pass "Magic Analysis" Pipeline
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import Agents
import { runPlanner } from '../_shared/agents/planner.ts';
import { runScanner } from '../_shared/agents/scanner.ts';
import { runExpander } from '../_shared/agents/expander.ts';
import { runCorrelator } from '../_shared/agents/correlator.ts';
import { runEnricher } from '../_shared/agents/enricher.ts';
import { runSynthesizer } from '../_shared/agents/synthesizer.ts';
import { AuditContext } from '../_shared/agents/types.ts';

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

    const { repoUrl, files, tier = 'security' } = await req.json();

    if (!repoUrl || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
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

    // --- PIPELINE EXECUTION ---

    // 0. Pass Zero: Planner (The CEO)
    // Decides effectively which files are relevant for this specific Audit Tier
    const { result: plan, usage: plannerUsage } = await runPlanner(context, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`🧠 CEO Plan: Focus on ${plan.focusArea}`);
    console.log(`   Scanner Targets: ${plan.scannerTargets.length} files`);
    console.log(`   Expander Targets: ${plan.expanderTargets.length} files`);

    // 1. Pass One: Scanner (The Scout)
    // Scanner now receives the Map and decides what to fetch? 
    // For V1 of this refactor, let's have the Scanner fetch the "Top 50" files by default to build the base map.
    // Or better: The Scanner *Refines* the map. 
    const timeStart = Date.now();
    const { result: scanResult, usage: scanUsage } = await runScanner(context, ENV.GEMINI_API_KEY, tierPrompt, plan.scannerTargets);
    console.log(`✅ Pass 1 (Scanner) Complete. Keys: ${Object.keys(scanResult || {}).join(', ')}`);
    if (!scanResult?.fileMap) console.warn('⚠️ Pass 1 Warning: No fileMap returned');

    // ... rest of pipeline ...

    // 2. Pass Two: Expander
    const { result: archMap, usage: expanderUsage } = await runExpander(context, scanResult, ENV.GEMINI_API_KEY, tierPrompt, plan.expanderTargets);
    console.log(`✅ Pass 2 (Expander) Complete. Keys: ${Object.keys(archMap || {}).join(', ')}`);

    // 3. Pass Three: Correlator
    const { result: correlation, usage: correlatorUsage } = await runCorrelator(context, archMap, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`✅ Pass 3 (Correlator) Complete. Issues Found: ${correlation?.potentialIssues?.length || 0}`);

    // 4. Pass Four: Enricher
    const { result: risks, usage: enricherUsage } = await runEnricher(context, correlation, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`✅ Pass 4 (Enricher) Complete. Findings: ${risks?.findings?.length || 0}`);

    // 5. Pass Five: Synthesizer
    const { result: finalReport, usage: synthesizerUsage } = await runSynthesizer(context, risks, ENV.GEMINI_API_KEY, tierPrompt);
    console.log(`✅ Pass 5 (Synthesizer) Complete. Final Issues: ${finalReport?.issues?.length || 0}`);

    const totalTime = ((Date.now() - timeStart) / 1000).toFixed(1);
    console.log(`🏁 Pipeline finished in ${totalTime}s`);

    // --- SAVE TO DB ---

    // Map internal "issues" specific format to general DB format
    // The Enricher/Synthesizer should return compatible issues, but let's standardise
    // We use the "issues" from finalReport which are filtered/prioritised

    // Fallback: If Synthesizer dropped everything, maybe rely on Enricher?
    const rawIssues = (finalReport?.issues && finalReport.issues.length > 0) ? finalReport.issues : (risks?.findings || []);

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

    const totalTokens = (plannerUsage?.totalTokens || 0) + (scanUsage?.totalTokens || 0) + (expanderUsage?.totalTokens || 0) +
      (correlatorUsage?.totalTokens || 0) + (enricherUsage?.totalTokens || 0) +
      (synthesizerUsage?.totalTokens || 0);

    console.log(`💰 Total Tokens Used: ${totalTokens}`);

    const { error: insertError } = await supabase.from('audits').insert({
      user_id: userId,
      repo_url: repoUrl,
      health_score: finalReport?.healthScore || risks?.securityScore || 0,
      summary: finalReport?.summary || "No summary generated.",
      issues: dbIssues,
      total_tokens: totalTokens,
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
          scan: scanResult,
          architecture: archMap,
          correlation: correlation,
          duration: totalTime
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
