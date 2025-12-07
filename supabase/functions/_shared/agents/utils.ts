
export const GEMINI_MODEL = 'gemini-1.5-pro';

export interface GeminiUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface GeminiResponse<T = any> {
    data: T;
    usage: GeminiUsage;
}

export async function callGemini(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.2
): Promise<GeminiResponse> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
                ],
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json"
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const usageRaw = data.usageMetadata || {};

    const usage: GeminiUsage = {
        promptTokens: usageRaw.promptTokenCount || 0,
        completionTokens: usageRaw.candidatesTokenCount || 0,
        totalTokens: (usageRaw.promptTokenCount || 0) + (usageRaw.candidatesTokenCount || 0)
    };

    try {
        // CLEANUP: Extract JSON from Markdown code blocks if present
        let cleanText = text.trim();
        // Remove ```json ... ``` or just ``` ... ```
        cleanText = cleanText.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '');

        return {
            data: JSON.parse(cleanText),
            usage
        };
    } catch (e) {
        console.error('Failed to parse Gemini JSON:', text);
        throw new Error('Invalid JSON response from Gemini');
    }
}
