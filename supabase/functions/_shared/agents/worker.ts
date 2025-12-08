
import { AuditContext, WorkerTask, WorkerResult } from './types.ts';
import { callGemini, GeminiUsage, fetchFileContent, isValidGitHubUrl } from './utils.ts';

// Get the set of valid file paths from context (source of truth from preflight)
function getValidFilePaths(context: AuditContext): Set<string> {
    return new Set(context.files.map(f => f.path));
}

// Validate and filter task files against preflight
function validateTargetFiles(
    taskFiles: string[],
    validPaths: Set<string>,
    taskRole: string
): { validFiles: string[]; invalidFiles: string[] } {
    const validFiles: string[] = [];
    const invalidFiles: string[] = [];

    for (const path of taskFiles) {
        if (validPaths.has(path)) {
            validFiles.push(path);
        } else {
            invalidFiles.push(path);
        }
    }

    if (invalidFiles.length > 0) {
        console.warn(`🚫 Worker [${taskRole}] attempted to access ${invalidFiles.length} files NOT in preflight:`, invalidFiles.slice(0, 5));
    }

    return { validFiles, invalidFiles };
}

export async function runWorker(
    context: AuditContext,
    task: WorkerTask,
    apiKey: string
): Promise<{ result: WorkerResult; usage: GeminiUsage }> {

    console.log(`👷 Worker [${task.role}] starting task: ${task.instruction.slice(0, 50)}...`);

    // SECURITY: Get valid files from preflight (single source of truth)
    const validPaths = getValidFilePaths(context);

    // VALIDATION: Filter LLM-suggested files against preflight file map
    // This prevents the LLM from hallucinating about files that don't exist
    const { validFiles, invalidFiles } = validateTargetFiles(
        task.targetFiles || [],
        validPaths,
        task.role
    );

    if (invalidFiles.length > 0 && validFiles.length === 0) {
        // ALL files requested by LLM are invalid - this is a serious issue
        console.error(`🚨 Worker [${task.role}] has NO valid files! All ${invalidFiles.length} requested files are NOT in the repository.`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "INVALID_FILE_PATHS",
                    message: `The requested files do not exist in this repository: ${invalidFiles.slice(0, 3).join(', ')}${invalidFiles.length > 3 ? '...' : ''}`,
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // 1. Fetch Files - ONLY files that exist in the preflight
    const filesToFetch = context.files.filter(f => validFiles.includes(f.path));

    if (filesToFetch.length === 0) {
        console.warn(`Worker [${task.role}] has no files to fetch.`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "NO_FILES_TO_ANALYZE",
                    message: "No valid files were assigned to this task.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // SECURITY: Validate URLs before fetching
    // Extract repo info from preflight if available  
    const repoOwnerPattern = context.preflight
        ? new RegExp(`/${context.preflight.owner}/${context.preflight.repo}/`, 'i')
        : null;

    const fetchedContent = await Promise.all(filesToFetch.map(async f => {
        if (!f.url) {
            console.warn(`⚠️ File ${f.path} has no URL - skipping`);
            return null;
        }

        // Validate URL is from GitHub
        if (!isValidGitHubUrl(f.url)) {
            console.error(`🚨 SECURITY: Blocked non-GitHub URL for ${f.path}: ${f.url}`);
            return null;
        }

        // If preflight is available, validate URL matches the declared repo
        if (repoOwnerPattern && !repoOwnerPattern.test(f.url)) {
            console.error(`🚨 SECURITY: URL does not match declared repo for ${f.path}: ${f.url}`);
            return null;
        }

        const content = await fetchFileContent(f.url, context.githubToken);

        // Check for empty content (could indicate auth failure or deleted file)
        if (!content || content.trim().length === 0) {
            console.warn(`⚠️ Empty content returned for ${f.path} - file may be inaccessible or deleted`);
            return null;
        }

        return `--- ${f.path} ---\n${content}`;
    }));

    // Filter out failed fetches
    const successfulContent = fetchedContent.filter(Boolean) as string[];

    // CRITICAL: If ALL file fetches failed, do NOT proceed with LLM analysis
    // This prevents hallucination when files can't be accessed (e.g., private repo without valid token)
    if (successfulContent.length === 0) {
        console.error(`🚨 Worker [${task.role}] could not fetch ANY file content! Aborting to prevent hallucination.`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "FILE_FETCH_FAILED",
                    message: `Could not retrieve content for any of the ${filesToFetch.length} requested files. This may indicate an authentication issue for private repositories.`,
                    filesAttempted: filesToFetch.map(f => f.path),
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // Log fetch success rate
    console.log(`📂 Worker [${task.role}] fetched ${successfulContent.length}/${filesToFetch.length} files successfully`);

    const fileContext = successfulContent.join('\n\n');

    // 2. Analyze
    const systemPrompt = `You are a ${task.role}. 
Your goal is to execute the following instruction based on the provided code.
Return a concise but detailed markdown analysis of your findings.
Focus ONLY on your instruction.

IMPORTANT: You must ONLY analyze the code provided below. Do NOT make assumptions or guess about code that is not shown.`;

    const userPrompt = `INSTRUCTION:
${task.instruction}

CODE CONTEXT (${successfulContent.length} files):
${fileContext}`;

    const { data, usage } = await callGemini(apiKey, systemPrompt, userPrompt, 0.2, { role: 'WORKER' });

    console.log(`✅ Worker [${task.role}] Finished. Analyzed ${successfulContent.length} files. Cost: ${usage.totalTokens} tokens.`);

    return {
        result: {
            taskId: task.id,
            findings: data, // Return raw object - no double serialization
            tokenUsage: usage.totalTokens
        },
        usage
    };
}
