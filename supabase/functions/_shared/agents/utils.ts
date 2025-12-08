
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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function extractJson(text: string): any {
    // 1. Try generic JSON.parse first (fastest)
    try {
        return JSON.parse(text);
    } catch (e) {
        // Continue to advanced extraction
    }

    // 2. Extract from markdown code blocks (```json ... ``` or just ``` ... ```)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = text.match(codeBlockRegex);
    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            // content inside code block wasn't valid JSON, continue
        }
    }

    // 3. Brute force: Find the first '{' and the last '}'
    const firstOpen = text.indexOf('{');
    const lastClose = text.lastIndexOf('}');

    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        const potentialJson = text.substring(firstOpen, lastClose + 1);
        try {
            return JSON.parse(potentialJson);
        } catch (e) {
            // failed to parse extracted block
        }
    }

    throw new Error("Could not extract valid JSON from response");
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callGemini(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.2
): Promise<GeminiResponse> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
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
                const errorText = await response.text();
                // If it's a 4xx error (except 429), it's likely a bad request, so don't retry unless it's strictly a rate limit
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new Error(`Gemini API error (Non-Retriable): ${response.status} ${errorText}`);
                }
                throw new Error(`Gemini API error: ${response.status} ${errorText}`);
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
                const parsedData = extractJson(text);
                return {
                    data: parsedData,
                    usage
                };
            } catch (e) {
                console.warn(`[Gemini] JSON Parse Warning (Attempt ${attempt}/${MAX_RETRIES}):`, e);
                console.debug(`[Gemini] Failed Content Preview: ${text.slice(0, 500)}...`);
                throw new Error('Invalid JSON response from Gemini');
            }

        } catch (error) {
            lastError = error;
            console.warn(`[Gemini] Attempt ${attempt}/${MAX_RETRIES} failed: ${error instanceof Error ? error.message : String(error)}`);

            if (attempt < MAX_RETRIES) {
                const backoff = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`[Gemini] Retrying in ${backoff}ms...`);
                await sleep(backoff);
            }
        }
    }

    console.error('[Gemini] All retry attempts failed.');
    throw lastError;
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
