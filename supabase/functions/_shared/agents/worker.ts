
import { AuditContext, WorkerTask, WorkerResult } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';
import { GitHubAPIClient } from '../github/GitHubAPIClient.ts';

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

    // SECURITY: Ensure preflight data is available (required for path-based fetching)
    if (!context.preflight) {
        console.error(`🚨 Worker [${task.role}] has no preflight data - cannot fetch files!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "NO_PREFLIGHT_DATA",
                    message: "Cannot fetch files without preflight data. This is a system error.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // Fetch files by path using GitHub API (preflight provides owner/repo/branch)
    const apiClient = new GitHubAPIClient(context.githubToken);
    
    const fetchedContent = await Promise.all(filesToFetch.map(async f => {

        try {
            const response = await apiClient.fetchFile(
                context.preflight!.owner,
                context.preflight!.repo,
                f.path,
                context.preflight!.default_branch
            );

            if (!response.ok) {
                console.error(`🚨 GitHub API error for ${f.path}: ${response.status}`);
                return null;
            }

            const fileData = await response.json();

            let content: string;
            // GitHub API returns content as base64
            if (fileData.encoding === 'base64' && fileData.content) {
                content = atob(fileData.content.replace(/\n/g, ''));
            } else if (fileData.content) {
                // Sometimes content is already decoded
                content = fileData.content;
            } else {
                console.error(`🚨 No content in GitHub API response for ${f.path}`);
                return null;
            }

            // Check for empty content
            if (!content || content.trim().length === 0) {
                console.warn(`⚠️ Empty content returned for ${f.path}`);
                return null;
            }

            return `--- ${f.path} ---\n${content}`;
        } catch (error) {
            console.error(`🚨 Fetch failed for ${f.path}:`, error);
            return null;
        }
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

    const fileContext = successfulContent.join('\n\n');

    // 2. Analyze
    const systemPrompt = `Analyze this code for the specified issues. Return findings in JSON format.`;

    const userPrompt = `INSTRUCTION:
${task.instruction}

CODE CONTEXT (${successfulContent.length} files):
${fileContext}`;

    const { data, usage } = await callGemini(apiKey, systemPrompt, userPrompt, 0.2, {
      role: 'WORKER',
      thinkingBudget: -1 // Use dynamic thinking for JSON output
    });

    console.log(`🤖 Worker [${task.role}] completed analysis:`, {
      issuesCount: data?.issues?.length || 0,
      hasHealthScore: typeof data?.healthScore === 'number',
      dataType: typeof data
    });

    return {
        result: {
            taskId: task.id,
            findings: data, // Return raw object - no double serialization
            tokenUsage: usage.totalTokens
        },
        usage
    };
}
