
// Gemini 2.5 Pro for all agents - reasoning model for quality audits
export const GEMINI_MODEL = 'gemini-2.5-pro';

// Thinking Budget Configuration
// -1 = Dynamic (model decides), 128-32768 = Fixed budget for Gemini 2.5 Pro
export const THINKING_BUDGET = {
    CEO: 20000,       // 20k tokens - fixed budget for comprehensive audit planning
    SYNTHESIZER: 100000, // 100k tokens - increased budget for thorough finding consolidation
    WORKER: 10000,    // 10k tokens - high budget for thorough scanning (8k-12k range)
    MetadataAnalyst: 5000, // 5k tokens - lighter budget for metadata-only analysis
} as const;

export type AgentRole = 'CEO' | 'SYNTHESIZER' | 'WORKER' | 'MetadataAnalyst';

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
    // 0. Clean the text first - remove thinking tokens and other artifacts
    let cleanText = text;

    // Remove thinking tokens that might wrap the JSON
    cleanText = cleanText.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    cleanText = cleanText.replace(/<\/thinking>[\s\S]*$/, ''); // Remove thinking at end

    // Remove any leading/trailing whitespace
    cleanText = cleanText.trim();

    // Limit processing to reasonable sizes to prevent huge malformed responses
    if (cleanText.length > 50000) {
        console.warn(`[extractJson] Response too large (${cleanText.length} chars), truncating to 50KB`);
        cleanText = cleanText.slice(0, 50000);
    }

    // 1. Try generic JSON.parse first (fastest)
    try {
        const parsed = JSON.parse(cleanText);
        // Basic validation - ensure it's an object with expected structure
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
        }
    } catch (e) {
        // Continue to advanced extraction
    }

    // 2. Extract from markdown code blocks (```json ... ``` or just ``` ... ```)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = cleanText.match(codeBlockRegex);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1].trim());
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
        } catch (e) {
            // content inside code block wasn't valid JSON, continue
        }
    }

    // 3. Look for JSON after thinking tokens (with size limit)
    const thinkingAfterRegex = /<\/thinking>\s*(\{[\s\S]{10,5000}?\})/; // Min 10, max 5000 chars
    const thinkingMatch = cleanText.match(thinkingAfterRegex);
    if (thinkingMatch && thinkingMatch[1]) {
        try {
            const parsed = JSON.parse(thinkingMatch[1].trim());
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
        } catch (e) {
            // Continue to structured search
        }
    }

    // 4. Try to find complete JSON objects by looking for balanced braces
    const jsonObjects = findCompleteJsonObjects(cleanText);
    for (const jsonObj of jsonObjects) {
        try {
            const parsed = JSON.parse(jsonObj);
            if (typeof parsed === 'object' && parsed !== null &&
                (parsed.tasks || parsed.issues || parsed.focusArea)) { // Has expected fields
                console.log(`[extractJson] Found valid JSON object with ${jsonObj.length} chars`);
                return parsed;
            }
        } catch (e) {
            continue;
        }
    }

    // 5. Last resort: Brute force with better validation
    const firstOpen = cleanText.indexOf('{');
    const lastClose = cleanText.lastIndexOf('}');

    if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        const potentialJson = cleanText.substring(firstOpen, lastClose + 1);
        // Only try if it's a reasonable size
        if (potentialJson.length < 10000) {
            try {
                const parsed = JSON.parse(potentialJson);
                if (typeof parsed === 'object' && parsed !== null) {
                    console.warn(`[extractJson] Brute force succeeded with ${potentialJson.length} char block`);
                    return parsed;
                }
            } catch (e) {
                console.warn(`[extractJson] Brute force failed on ${potentialJson.length} char block`);
            }
        }
    }

    console.error(`[extractJson] Could not extract valid JSON. Text length: ${cleanText.length}`);
    console.error(`[extractJson] Text preview: ${cleanText.slice(0, 300)}...`);
    throw new Error("Could not extract valid JSON from response");
}

// Helper function to find complete JSON objects
function findCompleteJsonObjects(text: string): string[] {
    const objects: string[] = [];
    let braceCount = 0;
    let startPos = -1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '{') {
            if (braceCount === 0) {
                startPos = i;
            }
            braceCount++;
        } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && startPos !== -1) {
                const jsonCandidate = text.substring(startPos, i + 1);
                if (jsonCandidate.length > 10 && jsonCandidate.length < 10000) {
                    objects.push(jsonCandidate);
                }
                startPos = -1;
            }
        }
    }

    return objects;
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
                            maxOutputTokens: options.role === 'CEO' ? 32768 : 16384,  // Higher limit for CEO/planner
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
                console.warn(`[Gemini] Raw text length: ${text.length} chars`);
                console.warn(`[Gemini] First 200 chars: ${text.slice(0, 200)}`);
                console.warn(`[Gemini] Last 200 chars: ${text.slice(-200)}`);

                // Try to identify common issues
                if (text.includes('<thinking>') || text.includes('</thinking>')) {
                    console.warn(`[Gemini] Response contains thinking tokens - extracting JSON from between them`);
                    const thinkingRegex = /<\/thinking>\s*(\{[\s\S]*\})\s*$/;
                    const thinkingMatch = text.match(thinkingRegex);
                    if (thinkingMatch && thinkingMatch[1]) {
                        try {
                            const extractedJson = JSON.parse(thinkingMatch[1]);
                            console.warn(`[Gemini] Successfully extracted JSON from after thinking tokens`);
                            return {
                                data: extractedJson,
                                usage
                            };
                        } catch (thinkingError) {
                            console.warn(`[Gemini] Failed to parse JSON after thinking tokens:`, thinkingError);
                        }
                    }
                }

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
