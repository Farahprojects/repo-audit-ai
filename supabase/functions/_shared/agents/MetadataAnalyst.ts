import { callGemini, GeminiUsage } from './utils.ts';
import { AuditContext, WorkerResult } from './types.ts';

// Heuristic interfaces
interface Heuristics {
    testRatio: number;
    testRatioLabel: string; // "High", "Low", "None"
    largeFiles: { path: string; sizeKb: number }[];
    infrastructureComplexity: number;
}

// Helper to calculate heuristics
function calculateHeuristics(files: { path: string; size: number }[]): Heuristics {
    let testCount = 0;
    let infraCount = 0;
    const largeFiles: { path: string; size: number }[] = [];

    // Sort by size descending
    const sortedFiles = [...files].sort((a, b) => b.size - a.size);
    const top5 = sortedFiles.slice(0, 5).map(f => ({ path: f.path, sizeKb: Math.round(f.size / 1024) }));

    for (const f of files) {
        if (/\.(test|spec)\./.test(f.path)) testCount++;
        if (/\.(json|yaml|yml|toml|docker|env)/.test(f.path)) infraCount++;
    }

    const ratio = files.length > 0 ? testCount / files.length : 0;

    return {
        testRatio: ratio,
        testRatioLabel: ratio > 0.3 ? "High" : ratio > 0.1 ? "Moderate" : "Low",
        largeFiles: top5,
        infrastructureComplexity: infraCount
    };
}

const SYSTEM_PROMPT = `You are a Senior Software Architect performing a "Metadata Audit" of a software repository.
Your goal is to infer architectural strengths, weaknesses, and risks based SOLELY on the file structure, naming conventions, and project metadata strings.

CRITICAL RULES:
1. DO NOT try to read file contents. You only have the file list and metadata.
2. Use the provided "Heuristics" (Test Ratio, Large Files, Infra Count) as FACTUAL EVIDENCE.
3. INFER patterns. For example:
   - "Low test ratio" -> Risk of regression.
   - "Large file size" (e.g. >100KB textual source) -> Likely code monolith / maintenance burden.
   - "Nested folder depth" -> potential complexity.
   - "Names like 'utils.ts' or 'common'" -> Check for "junk drawer" anti-patterns.
   - "Mixing of concerns" (e.g. SQL files inside component folders) -> Architecture violation.

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "issues": [
    {
      "category": "Security" | "Performance" | "Maintainability" | "Architecture",
      "severity": "critical" | "high" | "medium" | "low",
      "title": "Concise Title",
      "description": "Explanation of the risk based on the metadata evidence.",
      "fileRefs": ["path/to/relevant/file.ts"]
    }
  ],
  "healthScore": number (0-100),
  "summary": "A roughly 2-sentence executive summary of the repository state based on metadata."
}

Be sharp, critical, and observational. Don't be generic. Use the filenames provided.`;

export async function runMetadataAnalyst(
    context: AuditContext,
    apiKey: string
): Promise<{ result: WorkerResult; usage: GeminiUsage }> {
    console.log('Running Metadata Analyst (Free Tier)...');

    const files = context.files.map(f => ({ path: f.path, size: f.size || 0 }));
    const heuristics = calculateHeuristics(files);
    const fingerprint: any = context.preflight?.fingerprint || {};

    const fileList = files.map(f => `${f.path} (${Math.round(f.size / 1024)}kb)`).join('\n');

    const userPrompt = `REPOSITORY METADATA:
  
[HEURISTICS & FACTS]
- Test Coverage Ratio: ${(heuristics.testRatio * 100).toFixed(1)}% (${heuristics.testRatioLabel})
- Top 5 Largest Files (Monolith Risks):
${heuristics.largeFiles.map(f => `  - ${f.path}: ${f.sizeKb} KB`).join('\n')}
- Infrastructure Config Files: ${heuristics.infrastructureComplexity}
- Tech Stack: ${fingerprint.primary_language || 'Unknown'} (Supabase: ${fingerprint.has_supabase ? 'Yes' : 'No'})

[FILE TREE SNAPSHOT]
${fileList}

TASK:
Based on the heuristic facts and file tree above, identify:
1. ONE likely Performance Bottleneck (look for large files, deep nesting, or heavy assets).
2. ONE likely Security Risk (look for sensitive filenames, mixed concerns, or missing auth layers).
3. ONE Architectural Insight (structure, organization).

Provide a health score (0-100) and a brief summary.`;

    // We use a simplified return type here that maps to WorkerResult
    // Note: We might want to use a specific model like 'gemini-2.0-flash-exp' if available, 
    // currently we pass the generic model name or let the utility decide. 
    // Ideally, callGemini should accept a model override.
    // For now, we rely on the default behavior but set a low maxTokens if possible or just rely on the prompt constraint.

    // Checking `callGemini` signature in previous step... it takes `model` optional arg? 
    // Let's check `utils.ts` signature.
    // ... Utils signature check: callGemini(apiKey, systemPrompt, userPrompt, temperature, ...options)

    const { data, usage } = await callGemini(
        apiKey,
        SYSTEM_PROMPT,
        userPrompt,
        0.2,
        {
            role: 'MetadataAnalyst',
            thinkingBudget: -1 // Enable dynamic thinking budget for better reasoning
        }
    );

    // Map to WorkerResult structure
    const issues = data.issues || [];

    return {
        result: {
            taskId: 'metadata-analysis',
            findings: {
                issues: issues,
                summary: data.summary || "Metadata analysis completed.",
                healthScore: data.healthScore || 50
            },
            tokenUsage: usage.totalTokens
        },
        usage
    };
}
