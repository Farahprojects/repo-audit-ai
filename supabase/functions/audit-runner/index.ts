// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV = {
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  // Use specific version numbers for Google Cloud Console API keys (not AI Studio)
  // Available: gemini-1.5-pro-002, gemini-1.5-flash-002, gemini-2.0-flash
  GEMINI_MODEL: Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-pro-002',
};

const AUDIT_PROMPT = `You are an expert code auditor. Analyze the provided codebase and return a JSON response with the following structure:

{
  "healthScore": <number 0-100>,
  "summary": "<brief 2-3 sentence summary of the codebase health>",
  "issues": [
    {
      "id": "<unique_id>",
      "severity": "critical" | "warning" | "info",
      "category": "security" | "performance" | "maintainability" | "best-practices" | "dependencies",
      "title": "<short title>",
      "description": "<detailed description>",
      "file": "<file path if applicable>",
      "line": <line number if applicable>,
      "suggestion": "<how to fix>"
    }
  ]
}

Focus on:
1. Security vulnerabilities (exposed secrets, injection risks, unsafe patterns)
2. Performance issues (memory leaks, inefficient algorithms, unnecessary re-renders)
3. Code maintainability (complexity, duplication, unclear naming)
4. Best practices violations (missing error handling, poor typing, outdated patterns)
5. Dependency concerns (outdated packages, known vulnerabilities)

Be thorough but prioritize actionable insights. Return ONLY valid JSON, no markdown or explanation.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!ENV.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader && ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const { repoUrl, files } = await req.json();

    if (!repoUrl || !files || !Array.isArray(files)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: repoUrl and files array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting audit for: ${repoUrl} with ${files.length} files`);

    // Build context window
    const fileContext = files
      .map((f: { path: string; content: string }) => `--- ${f.path} ---\n${f.content}`)
      .join('\n\n');

    const userPrompt = `Analyze this codebase from ${repoUrl}:\n\n${fileContext}`;

    // Call Gemini API
    console.log('Calling Gemini API...');
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
            { role: 'user', parts: [{ text: AUDIT_PROMPT + '\n\n' + userPrompt }] }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[gemini] error:', geminiResponse.status, errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response received');

    // Extract and parse the JSON response
    let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up response if wrapped in markdown
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let auditResult;
    try {
      auditResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText);
      throw new Error('Failed to parse audit results');
    }

    const { healthScore, summary, issues } = auditResult;

    // Save to database if user is authenticated
    if (userId && ENV.SUPABASE_URL && ENV.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

      // Check and deduct credits
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .maybeSingle();

      if (profile && profile.credits > 0) {
        // Save audit record
        const { error: insertError } = await supabase
          .from('audits')
          .insert({
            user_id: userId,
            repo_url: repoUrl,
            health_score: healthScore,
            summary: summary,
            issues: issues
          });

        if (insertError) {
          console.error('Failed to save audit:', insertError);
        } else {
          // Deduct credit
          await supabase
            .from('profiles')
            .update({ credits: profile.credits - 1 })
            .eq('id', userId);

          console.log(`Audit saved for user ${userId}, credits remaining: ${profile.credits - 1}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        healthScore,
        summary,
        issues,
        filesAnalyzed: files.length
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
