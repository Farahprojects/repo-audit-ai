// @ts-nocheck
// Audit Runner - Orchestration layer for multi-agent audit system
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV = {
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
  GEMINI_MODEL: 'gemini-2.0-flash-exp',
};

// Tier credit costs (multi-agent uses more)
const TIER_CREDITS: Record<string, number> = {
  'shape': 2,
  'conventions': 4,
  'performance': 6,
  'security': 10,
};

// Token estimation: ~4 chars per token
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ============================================================================
// Chunking Logic
// ============================================================================
interface FileInfo {
  path: string;
  content: string;
  tokens: number;
}

interface Chunk {
  id: string;
  name: string;
  files: FileInfo[];
  totalTokens: number;
  priority: number;
}

function getFolderPriority(folderName: string): number {
  const priorities: Record<string, number> = {
    'src': 10, 'app': 10, 'lib': 9, 'api': 9, 'pages': 8,
    'components': 8, 'services': 8, 'hooks': 7, 'utils': 7,
    'supabase': 9, 'functions': 9, 'server': 9, 'auth': 10,
    'middleware': 8, 'config': 6, 'types': 5, 'styles': 3,
    '_root': 5,
  };
  return priorities[folderName.toLowerCase()] || 5;
}

function createChunks(
  files: Array<{ path: string; content: string }>,
  maxTokensPerChunk: number = 400000
): Chunk[] {
  const filesWithTokens: FileInfo[] = files.map(f => ({
    ...f,
    tokens: estimateTokens(f.content),
  }));

  const totalTokens = filesWithTokens.reduce((sum, f) => sum + f.tokens, 0);
  console.log(`📊 Total tokens: ${totalTokens.toLocaleString()}`);

  // Small repo: single chunk
  if (totalTokens <= maxTokensPerChunk) {
    return [{
      id: 'all',
      name: 'Full Repository',
      files: filesWithTokens,
      totalTokens,
      priority: 10,
    }];
  }

  // Group by folder
  const folders = new Map<string, FileInfo[]>();
  for (const file of filesWithTokens) {
    const parts = file.path.split('/');
    const folder = parts.length > 1 ? parts[0] : '_root';
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder)!.push(file);
  }

  const chunks: Chunk[] = [];
  const smallFolders: FileInfo[] = [];

  for (const [folderName, folderFiles] of folders) {
    const folderTokens = folderFiles.reduce((sum, f) => sum + f.tokens, 0);

    if (folderTokens > maxTokensPerChunk) {
      // Split large folder
      let currentChunk: FileInfo[] = [];
      let currentTokens = 0;
      let chunkIndex = 0;

      for (const file of folderFiles) {
        if (currentTokens + file.tokens > maxTokensPerChunk && currentChunk.length > 0) {
          chunks.push({
            id: `${folderName}-${chunkIndex}`,
            name: `${folderName} (part ${chunkIndex + 1})`,
            files: currentChunk,
            totalTokens: currentTokens,
            priority: getFolderPriority(folderName),
          });
          currentChunk = [];
          currentTokens = 0;
          chunkIndex++;
        }
        currentChunk.push(file);
        currentTokens += file.tokens;
      }
      if (currentChunk.length > 0) {
        chunks.push({
          id: `${folderName}-${chunkIndex}`,
          name: chunkIndex > 0 ? `${folderName} (part ${chunkIndex + 1})` : folderName,
          files: currentChunk,
          totalTokens: currentTokens,
          priority: getFolderPriority(folderName),
        });
      }
    } else if (folderTokens < 30000) {
      // Small folder: queue for merging
      smallFolders.push(...folderFiles);
    } else {
      // Medium folder: single chunk
      chunks.push({
        id: folderName,
        name: folderName,
        files: folderFiles,
        totalTokens: folderTokens,
        priority: getFolderPriority(folderName),
      });
    }
  }

  // Merge small folders
  if (smallFolders.length > 0) {
    const smallTotal = smallFolders.reduce((sum, f) => sum + f.tokens, 0);
    chunks.push({
      id: 'misc',
      name: 'Other Files',
      files: smallFolders,
      totalTokens: smallTotal,
      priority: 4,
    });
  }

  chunks.sort((a, b) => b.priority - a.priority);
  console.log(`📦 Created ${chunks.length} chunks for parallel processing`);
  return chunks;
}

// ============================================================================
// Worker Prompts
// ============================================================================
const WORKER_BASE = `You are a WORKER AGENT in a multi-agent code audit system.
You are analyzing ONE CHUNK of a larger codebase.

OUTPUT FORMAT (return ONLY valid JSON):
{
  "localScore": <number 0-100>,
  "confidence": <number 0.0-1.0>,
  "issues": [
    {
      "id": "<unique_id>",
      "severity": "critical" | "warning" | "info",
      "category": "<category>",
      "title": "<short title>",
      "description": "<detailed finding>",
      "file": "<file path>",
      "line": <line number or null>,
      "badCode": "<problematic code snippet if applicable>",
      "fixedCode": "<corrected code if applicable>",
      "suggestion": "<actionable fix>"
    }
  ],
  "crossFileFlags": ["<dependency or concern that affects other chunks>"],
  "uncertainties": ["<things you couldn't determine from this chunk alone>"]
}`;

const TIER_PROMPTS: Record<string, string> = {
  'shape': WORKER_BASE + `\n\n## FOCUS: STRUCTURAL SHAPE
Check: folder organization, dependency hygiene, naming conventions, AI-generated indicators, red flags.
Categories: maintainability | best-practices | security`,

  'conventions': WORKER_BASE + `\n\n## FOCUS: SENIOR CRAFTSMANSHIP
Check: type safety, error handling, code organization, naming, documentation, performance awareness.
Categories: maintainability | best-practices | performance | security`,

  'performance': WORKER_BASE + `\n\n## FOCUS: PERFORMANCE DEEP DIVE
Check: N+1 patterns, React re-renders, memory leaks, async anti-patterns, bundle issues, AI sins.
Category: performance`,

  'security': WORKER_BASE + `\n\n## FOCUS: SECURITY VULNERABILITIES
Check: auth/authz, RLS policies, input validation, secrets, data exposure, edge function security.
Category: security. Include CWE references.`,
};

// ============================================================================
// Coordinator Synthesis (for multi-chunk repos)
// ============================================================================
async function callCoordinator(workerFindings: any[], tier: string, repoUrl: string): Promise<any> {
  console.log(`🎯 Calling Coordinator to synthesize ${workerFindings.length} worker findings...`);
  
  const SYNTHESIS_PROMPT = `You are the COORDINATOR AGENT synthesizing a multi-agent code audit.

Worker agents have analyzed different chunks of this codebase.
Your job is to:
1. Review all worker findings
2. Resolve any conflicts or contradictions
3. Generate a unified executive summary
4. Assign a final health score (0-100)

Consider:
- Weight scores by chunk size and confidence
- Critical issues should heavily impact the final score
- Cross-file flags indicate systemic issues
- Uncertainties should add slight negative bias

Return ONLY valid JSON:
{
  "healthScore": <number 0-100>,
  "summary": "<2-3 sentence executive summary covering all workers>",
  "topStrengths": ["<strength 1>", "<strength 2>", ...],
  "topIssues": ["<issue 1>", "<issue 2>", ...],
  "conflictsResolved": ["<any contradictions you resolved>"],
  "additionalInsights": ["<patterns visible only across chunks>"],
  "productionReady": <boolean>,
  "riskLevel": "<critical|high|medium|low>"
}`;

  // Build findings summary for coordinator
  const findingsSummary = workerFindings.map((f: any) => `
## Chunk: ${f.chunkName} (${f.tokensAnalyzed.toLocaleString()} tokens)
- Local Score: ${f.localScore}/100 (confidence: ${f.confidence})
- Issues Found: ${f.issues?.length || 0}
${f.issues?.slice(0, 5).map((i: any) => `  - [${i.severity}] ${i.title}`).join('\n') || '  None'}
- Cross-File Flags: ${f.crossFileFlags?.join(', ') || 'None'}
- Uncertainties: ${f.uncertainties?.join(', ') || 'None'}
`).join('\n');

  const userPrompt = `Repository: ${repoUrl}
Audit Tier: ${tier}
Total Chunks Analyzed: ${workerFindings.length}

WORKER FINDINGS:
${findingsSummary}

Generate the final synthesis.`;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': ENV.GEMINI_API_KEY!
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: SYNTHESIS_PROMPT + '\n\n' + userPrompt }] }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      console.error('[Coordinator] Gemini error:', geminiResponse.status);
      return null;
    }

    const geminiData = await geminiResponse.json();
    let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const result = JSON.parse(responseText);
    console.log(`✅ Coordinator synthesis complete: healthScore=${result.healthScore}, riskLevel=${result.riskLevel}`);
    return result;
  } catch (e) {
    console.error('[Coordinator] Error:', e);
    return null;
  }
}

// ============================================================================
// Main Handler
// ============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ENV.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader && ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { repoUrl, files, tier = 'shape' } = await req.json();

    if (!repoUrl || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedTier = tier.toLowerCase();
    const creditCost = TIER_CREDITS[selectedTier] || 2;
    const workerPrompt = TIER_PROMPTS[selectedTier] || TIER_PROMPTS['shape'];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 MULTI-AGENT ${selectedTier.toUpperCase()} AUDIT`);
    console.log(`📁 Repository: ${repoUrl}`);
    console.log(`📄 Files: ${files.length}`);
    console.log(`${'='.repeat(60)}\n`);

    // Step 1: Create chunks for parallel processing
    const chunks = createChunks(files);
    const isMultiChunk = chunks.length > 1;
    
    console.log(`\n🤖 AGENT DISPATCH:`);
    chunks.forEach((chunk, i) => {
      console.log(`   Worker ${i + 1}: ${chunk.name} (${chunk.files.length} files, ${chunk.totalTokens.toLocaleString()} tokens)`);
    });
    console.log('');

    // Step 2: Dispatch workers in parallel
    const workerPromises = chunks.map(async (chunk, index) => {
      const startTime = Date.now();
      console.log(`⚡ [Worker ${index + 1}/${chunks.length}] Starting analysis of "${chunk.name}"...`);
      
      const fileContext = chunk.files
        .map(f => `--- ${f.path} ---\n${f.content}`)
        .join('\n\n');

      const userPrompt = `Analyze this code chunk from ${repoUrl}:
Chunk: ${chunk.name}
Files: ${chunk.files.length}

${fileContext}`;

      // Direct Gemini call (inline worker)
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': ENV.GEMINI_API_KEY!
          },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: workerPrompt + '\n\n' + userPrompt }] }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!geminiResponse.ok) {
        console.error(`❌ [Worker ${index + 1}] Failed after ${elapsed}s:`, geminiResponse.status);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          filesAnalyzed: chunk.files.length,
          localScore: 50,
          confidence: 0.3,
          issues: [],
          crossFileFlags: [`Worker ${chunk.id} failed`],
          uncertainties: [],
          duration: elapsed,
        };
      }

      const geminiData = await geminiResponse.json();
      let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const result = JSON.parse(responseText);
        console.log(`✅ [Worker ${index + 1}] Completed in ${elapsed}s → Score: ${result.localScore}, Issues: ${result.issues?.length || 0}`);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          filesAnalyzed: chunk.files.length,
          duration: elapsed,
          ...result,
        };
      } catch {
        console.error(`⚠️ [Worker ${index + 1}] Parse error after ${elapsed}s`);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          filesAnalyzed: chunk.files.length,
          localScore: 50,
          confidence: 0.3,
          issues: [],
          crossFileFlags: [`Worker ${chunk.id} parse error`],
          uncertainties: [],
          duration: elapsed,
        };
      }
    });

    const workerFindings = await Promise.all(workerPromises);
    console.log(`\n📊 All ${workerFindings.length} workers complete`);

    // Step 3: Synthesize findings
    let healthScore: number;
    let summary: string;
    let coordinatorInsights: any = null;

    // Collect all issues from workers
    const allIssues = workerFindings.flatMap(f => f.issues || []);
    const totalTokens = workerFindings.reduce((sum, f) => sum + f.tokensAnalyzed, 0);
    const crossFileFlags = [...new Set(workerFindings.flatMap(f => f.crossFileFlags || []))];

    // If multi-chunk, use Coordinator for AI-powered synthesis
    if (isMultiChunk) {
      console.log(`\n🎯 COORDINATOR SYNTHESIS (multi-chunk repo)`);
      coordinatorInsights = await callCoordinator(workerFindings, selectedTier, repoUrl);
    }

    if (coordinatorInsights) {
      // Use coordinator's synthesized score and summary
      healthScore = coordinatorInsights.healthScore;
      summary = coordinatorInsights.summary;
      console.log(`✅ Coordinator score: ${healthScore}/100`);
    } else {
      // Fallback: simple weighted average
      const avgScore = workerFindings.reduce((sum, f) => sum + (f.localScore || 50), 0) / workerFindings.length;
      healthScore = Math.round(avgScore);
      healthScore -= Math.min(crossFileFlags.length * 2, 10); // Cross-file penalty
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      summary = `Multi-agent analysis across ${chunks.length} code regions found ${allIssues.length} issues. ` +
        `Health score: ${healthScore}/100. ` +
        (allIssues.filter(i => i.severity === 'critical').length > 0
          ? `${allIssues.filter(i => i.severity === 'critical').length} critical issues require immediate attention.`
          : 'No critical issues found.');
    }

    // Deduplicate issues
    const issueMap = new Map();
    for (const issue of allIssues) {
      const key = `${issue.category}-${issue.title}-${issue.file}`.toLowerCase();
      if (!issueMap.has(key) || issue.description.length > issueMap.get(key).description.length) {
        issueMap.set(key, issue);
      }
    }
    const uniqueIssues = Array.from(issueMap.values());

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    uniqueIssues.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    // Transform issues for frontend
    const issues = uniqueIssues.map((issue, index) => ({
      id: issue.id || `issue-${index + 1}`,
      title: issue.title,
      description: issue.description,
      category: issue.category === 'security' ? 'Security' :
        issue.category === 'performance' ? 'Performance' : 'Architecture',
      severity: issue.severity === 'critical' ? 'Critical' :
        issue.severity === 'warning' ? 'Warning' : 'Info',
      filePath: issue.file || 'Repository-wide',
      lineNumber: issue.line || 0,
      badCode: issue.badCode || '',
      fixedCode: issue.fixedCode || '',
    }));

    // Save to DB
    if (userId && ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .maybeSingle();

      if (profile && profile.credits >= creditCost) {
        await supabase.from('audits').insert({
          user_id: userId,
          repo_url: repoUrl,
          health_score: healthScore,
          summary: summary,
          issues: issues,
        });
        await supabase
          .from('profiles')
          .update({ credits: profile.credits - creditCost })
          .eq('id', userId);
        console.log(`💾 Saved to DB, credits: ${profile.credits} → ${profile.credits - creditCost}`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ AUDIT COMPLETE`);
    console.log(`   Score: ${healthScore}/100`);
    console.log(`   Issues: ${issues.length}`);
    console.log(`   Mode: ${isMultiChunk ? 'Multi-Agent' : 'Single-Agent'}`);
    console.log(`${'='.repeat(60)}\n`);

    return new Response(
      JSON.stringify({
        healthScore,
        summary,
        issues,
        filesAnalyzed: files.length,
        tier: selectedTier,
        // Multi-agent metadata
        multiAgent: {
          enabled: true,
          chunksAnalyzed: chunks.length,
          totalTokensAnalyzed: totalTokens,
          crossFileFlags,
          workerDetails: workerFindings.map(w => ({
            chunk: w.chunkName,
            files: w.filesAnalyzed,
            tokens: w.tokensAnalyzed,
            score: w.localScore,
            issues: w.issues?.length || 0,
            duration: w.duration,
          })),
          coordinatorUsed: !!coordinatorInsights,
        },
        // Coordinator insights if available
        ...(coordinatorInsights ? {
          topStrengths: coordinatorInsights.topStrengths,
          topIssues: coordinatorInsights.topIssues,
          additionalInsights: coordinatorInsights.additionalInsights,
          productionReady: coordinatorInsights.productionReady,
          riskLevel: coordinatorInsights.riskLevel,
        } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Audit runner error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
