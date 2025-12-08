// @ts-nocheck
// Worker Agent - Analyzes a single chunk of code

import { handleCorsPreflight, createErrorResponse, createSuccessResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return handleCorsPreflight();
    }

    try {
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        const GEMINI_MODEL = 'gemini-2.0-flash-exp';

        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const { chunkId, chunkName, files, prompt, repoUrl } = await req.json();

        if (!files || !prompt) {
            return createErrorResponse('Missing required parameters: files and prompt', 400);
        }

        console.log(`🔧 Worker starting analysis of chunk: ${chunkName} (${files.length} files)`);

        // Build file context
        const fileContext = files
            .map((f: { path: string; content: string }) => `--- ${f.path} ---\n${f.content}`)
            .join('\n\n');

        const totalChars = fileContext.length;
        const estimatedTokens = Math.ceil(totalChars / 4);
        console.log(`📊 Chunk size: ~${estimatedTokens.toLocaleString()} tokens`);

        const userPrompt = `Analyze this code chunk from ${repoUrl}:
    
Chunk: ${chunkName}
Files: ${files.length}

${fileContext}`;

        // Call Gemini API
        const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY
                },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: prompt + '\n\n' + userPrompt }] }
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
            console.error(`[Worker ${chunkId}] Gemini error:`, geminiResponse.status, errorText);
            throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();

        // Log token usage
        const usage = geminiData.usageMetadata;
        if (usage) {
            console.log(`📊 [${chunkId}] Tokens: prompt=${usage.promptTokenCount}, response=${usage.candidatesTokenCount}`);
        }

        // Extract and parse response
        let responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let workerResult;
        try {
            workerResult = JSON.parse(responseText);
        } catch (parseError) {
            console.error(`[Worker ${chunkId}] Failed to parse response:`, responseText.substring(0, 500));
            // Return a default result on parse failure
            workerResult = {
                localScore: 50,
                confidence: 0.3,
                issues: [],
                crossFileFlags: ['Worker failed to parse analysis'],
                uncertainties: ['Parse error - manual review recommended'],
            };
        }

        console.log(`✅ [${chunkId}] Analysis complete: score=${workerResult.localScore}, issues=${workerResult.issues?.length || 0}`);

        return createSuccessResponse({
            chunkId,
            chunkName,
            tokensAnalyzed: estimatedTokens,
            ...workerResult, // localScore, confidence, issues, crossFileFlags, uncertainties
        });

    } catch (error) {
        console.error('Worker error:', error);
        return createErrorResponse(error, 500);
    }
});
