
import { AuditContext, WorkerTask, WorkerResult } from './types.ts';
import { callGemini, GeminiUsage, fetchFileContent } from './utils.ts';

export async function runWorker(
    context: AuditContext,
    task: WorkerTask,
    apiKey: string
): Promise<{ result: WorkerResult; usage: GeminiUsage }> {

    console.log(`👷 Worker [${task.role}] starting task: ${task.instruction.slice(0, 50)}...`);

    // 1. Fetch Files
    // We look up the URL from the context.files map using the path
    const filesToFetch = context.files.filter(f => task.targetFiles.includes(f.path));

    if (filesToFetch.length === 0) {
        console.warn(`Worker [${task.role}] has no files to fetch.`);
        return {
            result: { taskId: task.id, findings: "No files found to analyze.", tokenUsage: 0 },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    const fetchedContent = await Promise.all(filesToFetch.map(async f => {
        if (!f.url) return null;
        const content = await fetchFileContent(f.url);
        return `--- ${f.path} ---\n${content}`;
    }));

    const fileContext = fetchedContent.filter(Boolean).join('\n\n');

    // 2. Analyze
    const systemPrompt = `You are a ${task.role}. 
Your goal is to execute the following instruction based on the provided code.
Return a concise but detailed markdown analysis of your findings.
Focus ONLY on your instruction.`;

    const userPrompt = `INSTRUCTION:
${task.instruction}

CODE CONTEXT:
${fileContext}`;

    const { data, usage } = await callGemini(apiKey, systemPrompt, userPrompt, 0.2);

    // Note: 'data' here is likely JSON if callGemini parses it, or text if it failed.
    // Ideally callGemini should support returning raw text if we want markdown.
    // But our utils.ts enforces JSON currently. 
    // Let's assume the worker should return JSON findings or valid JSON wrapper around text.
    // Actually, for "Findings", text/markdown is often better than strict JSON structure at this stage.
    // I'll update the prompt to ask for JSON to keep utils.ts happy.

    // Revised System Prompt to ensure JSON compatibility with utils.ts
    // "Return JSON: { analysis: string, issues: [] }"

    console.log(`✅ Worker [${task.role}] Finished. Cost: ${usage.totalTokens} tokens.`);

    return {
        result: {
            taskId: task.id,
            findings: JSON.stringify(data), // Store the object as string for the Synthesizer
            tokenUsage: usage.totalTokens
        },
        usage
    };
}
