
// Gemini 2.5 Pro for all agents - reasoning model for quality audits
export const GEMINI_MODEL = 'gemini-2.5-pro';

// Thinking Budget Configuration
// -1 = Dynamic (model decides), 128-32768 = Fixed budget for Gemini 2.5 Pro
export const THINKING_BUDGET = {
    CEO: 20000,       // 20k tokens - fixed budget for comprehensive audit planning
    SYNTHESIZER: 25000, // 25k tokens - fixed budget for thorough finding consolidation
    WORKER: 10000,    // 10k tokens - high budget for thorough scanning (8k-12k range)
} as const;

export type AgentRole = 'CEO' | 'SYNTHESIZER' | 'WORKER';

export interface GeminiUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface GeminiResponse<T = any> {
    data: T;
    usage: GeminiUsage;
}

export interface GeminiCallOptions {
    role?: AgentRole;           // Determines thinking budget
    thinkingBudget?: number;    // Override: -1 = dynamic, 128+ = fixed
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
    temperature: number = 0.2,
    options: GeminiCallOptions = {}
): Promise<GeminiResponse> {
    // Determine thinking budget: explicit override > role-based > default to dynamic
    const thinkingBudget = options.thinkingBudget ??
        (options.role ? THINKING_BUDGET[options.role] : THINKING_BUDGET.WORKER);

    const roleLabel = options.role || 'UNKNOWN';

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
                            maxOutputTokens: 16384,  // Increased for complex planner output
                            responseMimeType: "application/json",
                            // Role-based thinking budget configuration
                            thinkingConfig: {
                                includeThoughts: false,
                                thinkingBudget: thinkingBudget
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

export interface FetchResult {
    success: boolean;
    content: string;
    error?: string;
    errorCode?: 'AUTH_FAILED' | 'RATE_LIMITED' | 'NOT_FOUND' | 'NETWORK_ERROR' | 'INVALID_URL' | 'TIMEOUT' | 'TOO_LARGE';
}

export async function fetchFileContentWithDetails(url: string, token?: string): Promise<FetchResult> {
    // Validate URL to prevent SSRF attacks
    if (!isValidGitHubUrl(url)) {
        console.warn(`Blocked fetch to untrusted URL: ${url}`);
        return { success: false, content: "", error: "Invalid URL domain", errorCode: 'INVALID_URL' };
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'SCAI'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, {
            signal: controller.signal,
            headers
        });
        clearTimeout(timeoutId);

        // Detailed error handling
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                console.warn(`🔐 Auth failed for ${url}: ${res.status}`);
                return { success: false, content: "", error: `Authentication failed (${res.status})`, errorCode: 'AUTH_FAILED' };
            }
            if (res.status === 404) {
                console.warn(`📁 File not found: ${url}`);
                return { success: false, content: "", error: "File not found", errorCode: 'NOT_FOUND' };
            }
            if (res.status === 429) {
                console.warn(`⏳ Rate limited: ${url}`);
                return { success: false, content: "", error: "GitHub rate limit exceeded", errorCode: 'RATE_LIMITED' };
            }
            console.warn(`❌ Fetch failed for ${url}: ${res.status}`);
            return { success: false, content: "", error: `HTTP ${res.status}`, errorCode: 'NETWORK_ERROR' };
        }

        // Limit response size to 1MB to prevent memory exhaustion
        const text = await res.text();
        if (text.length > 1024 * 1024) {
            console.warn(`File too large, truncating: ${url}`);
            return { success: true, content: text.slice(0, 1024 * 1024), error: "Truncated due to size" };
        }

        // Validate content isn't an error page or HTML when we expect code
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            console.warn(`⚠️ Received HTML instead of code for ${url} - possible redirect or error page`);
            return { success: false, content: "", error: "Received HTML instead of code content", errorCode: 'AUTH_FAILED' };
        }

        return { success: true, content: text };
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            console.warn(`⏱️ Timeout fetching ${url}`);
            return { success: false, content: "", error: "Request timed out", errorCode: 'TIMEOUT' };
        }
        console.warn(`Network error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`);
        return { success: false, content: "", error: String(e), errorCode: 'NETWORK_ERROR' };
    }
}

// Legacy function for backward compatibility - returns empty string on failure
export async function fetchFileContent(url: string, token?: string): Promise<string> {
    const result = await fetchFileContentWithDetails(url, token);
    return result.content;
}
