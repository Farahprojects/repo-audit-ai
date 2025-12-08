
export const GEMINI_MODEL = 'gemini-2.5-pro';

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
                    responseMimeType: "application/json",
                    // Enable dynamic reasoning
                    thinkingConfig: {
                        includeThoughts: false, // We only want the final JSON, not the thought trace
                        thinkingBudget: 1024 // Moderate budget for "Thinking"
                    }
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

// Allowed domains for fetching file content (SSRF protection)
const ALLOWED_URL_PATTERNS = [
    /^https:\/\/raw\.githubusercontent\.com\//,
    /^https:\/\/api\.github\.com\//,
    /^https:\/\/github\.com\/.*\/raw\//,
];

export function isValidGitHubUrl(url: string): boolean {
    return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url));
}

export async function fetchFileContent(url: string): Promise<string> {
    // Validate URL to prevent SSRF attacks
    if (!isValidGitHubUrl(url)) {
        console.warn(`Blocked fetch to untrusted URL: ${url}`);
        return "";
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Failed to fetch ${url}`);
        
        // Limit response size to 1MB to prevent memory exhaustion
        const text = await res.text();
        if (text.length > 1024 * 1024) {
            console.warn(`File too large, truncating: ${url}`);
            return text.slice(0, 1024 * 1024);
        }
        
        return text;
    } catch (e) {
        // Silencing noisy network errors as requested by user
        // console.debug(`Fetch failed: ${url}`); 
        return "";
    }
}
