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
// Chunking Logic (inline for edge function)
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
  console.log(`📦 Created ${chunks.length} chunks`);
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

    console.log(`🚀 Starting multi-agent ${selectedTier} audit for: ${repoUrl}`);

    // Step 1: Create chunks
    const chunks = createChunks(files);
    console.log(`📦 Dispatching ${chunks.length} workers`);

    // Step 2: Call workers in parallel
    const workerPromises = chunks.map(async (chunk) => {
      const fileContext = chunk.files
        .map(f => `--- ${f.path} ---\n${f.content}`)
        .join('\n\n');

      const userPrompt = `Analyze this code chunk from ${repoUrl}:
Chunk: ${chunk.name}
Files: ${chunk.files.length}

${fileContext}`;

      // Direct Gemini call (inline worker for now)
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': ENV.GEMINI_API_KEY
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

      if (!geminiResponse.ok) {
        console.error(`[Worker ${chunk.id}] Failed:`, geminiResponse.status);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          localScore: 50,
          confidence: 0.3,
          issues: [],
          crossFileFlags: [`Worker ${chunk.id} failed`],
          uncertainties: [],
        };
      }

      const geminiData = await geminiResponse.json();
      let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const result = JSON.parse(responseText);
        console.log(`✅ [${chunk.id}] Score: ${result.localScore}, Issues: ${result.issues?.length || 0}`);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          ...result,
        };
      } catch {
        console.error(`[Worker ${chunk.id}] Parse error`);
        return {
          chunkId: chunk.id,
          chunkName: chunk.name,
          tokensAnalyzed: chunk.totalTokens,
          localScore: 50,
          confidence: 0.3,
          issues: [],
          crossFileFlags: [`Worker ${chunk.id} parse error`],
          uncertainties: [],
        };
      }
    });

    const workerFindings = await Promise.all(workerPromises);
    console.log(`📊 All ${workerFindings.length} workers complete`);

    // Step 3: Synthesize findings
    const allIssues = workerFindings.flatMap(f => f.issues || []);
    const avgScore = workerFindings.reduce((sum, f) => sum + (f.localScore || 50), 0) / workerFindings.length;
    const totalTokens = workerFindings.reduce((sum, f) => sum + f.tokensAnalyzed, 0);
    const crossFileFlags = [...new Set(workerFindings.flatMap(f => f.crossFileFlags || []))];

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
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    uniqueIssues.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    // Calculate final score with penalties
    let healthScore = Math.round(avgScore);
    healthScore -= Math.min(crossFileFlags.length * 2, 10); // Cross-file penalty
    healthScore = Math.max(0, Math.min(100, healthScore));

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

    const summary = `Multi-agent analysis across ${chunks.length} code regions found ${issues.length} issues. ` +
      `Health score: ${healthScore}/100. ` +
      (issues.filter(i => i.severity === 'Critical').length > 0
        ? `${issues.filter(i => i.severity === 'Critical').length} critical issues require immediate attention.`
        : 'No critical issues found.');

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
          tier: selectedTier  // Track which audit type was run
        });
        await supabase
          .from('profiles')
          .update({ credits: profile.credits - creditCost })
          .eq('id', userId);
        console.log(`💾 Saved, credits: ${profile.credits} → ${profile.credits - creditCost}`);
      }
    }

    console.log(`✅ Audit complete: ${healthScore}/100, ${issues.length} issues`);

    return new Response(
      JSON.stringify({
        healthScore,
        summary,
        issues,
        filesAnalyzed: files.length,
        tier: selectedTier,
        multiAgent: {
          chunksAnalyzed: chunks.length,
          totalTokensAnalyzed: totalTokens,
          crossFileFlags,
        },
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
