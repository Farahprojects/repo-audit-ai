// Coordinator Agent - Plans and synthesizes multi-agent audit
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV = {
    GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
    GEMINI_MODEL: 'gemini-2.0-flash-exp',
};

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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        if (!ENV.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const { action, workerFindings, tier, repoUrl } = await req.json();

        if (action === 'synthesize') {
            // Synthesis phase - merge all worker findings
            console.log(`🎯 Coordinator synthesizing ${workerFindings.length} worker findings`);

            // Build findings summary for coordinator
            const findingsSummary = workerFindings.map((f: any) => `
## Chunk: ${f.chunkName}
- Tokens Analyzed: ${f.tokensAnalyzed}
- Local Score: ${f.localScore}/100
- Confidence: ${f.confidence}
- Issues Found: ${f.issues?.length || 0}
${f.issues?.map((i: any) => `  - [${i.severity}] ${i.title}: ${i.description.substring(0, 100)}...`).join('\n') || '  None'}
- Cross-File Flags: ${f.crossFileFlags?.join(', ') || 'None'}
- Uncertainties: ${f.uncertainties?.join(', ') || 'None'}
`).join('\n');

            const userPrompt = `Repository: ${repoUrl}
Audit Tier: ${tier}
Total Chunks Analyzed: ${workerFindings.length}

WORKER FINDINGS:
${findingsSummary}

Generate the final synthesis.`;

            // Call Gemini for synthesis
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
                const errorText = await geminiResponse.text();
                console.error('[Coordinator] Gemini error:', geminiResponse.status, errorText);
                throw new Error(`Gemini API error: ${geminiResponse.status}`);
            }

            const geminiData = await geminiResponse.json();

            // Log token usage
            const usage = geminiData.usageMetadata;
            if (usage) {
                console.log(`📊 [Coordinator] Tokens: prompt=${usage.promptTokenCount}, response=${usage.candidatesTokenCount}`);
            }

            // Extract and parse response
            let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            let synthesisResult;
            try {
                synthesisResult = JSON.parse(responseText);
            } catch (parseError) {
                console.error('[Coordinator] Failed to parse synthesis:', responseText.substring(0, 500));
                // Calculate fallback score from worker scores
                const avgScore = workerFindings.reduce((sum: number, f: any) => sum + (f.localScore || 50), 0) / workerFindings.length;
                synthesisResult = {
                    healthScore: Math.round(avgScore),
                    summary: `Multi-agent analysis of ${workerFindings.length} code regions completed. Manual synthesis required.`,
                    topStrengths: [],
                    topIssues: [],
                    productionReady: avgScore >= 70,
                    riskLevel: avgScore >= 80 ? 'low' : avgScore >= 60 ? 'medium' : 'high',
                };
            }

            console.log(`✅ Coordinator synthesis complete: score=${synthesisResult.healthScore}`);

            return new Response(
                JSON.stringify(synthesisResult),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action. Use: synthesize' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Coordinator error:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
