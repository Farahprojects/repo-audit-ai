
import { AuditContext, WorkerTask, WorkerResult } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';
import { GitHubAPIClient } from '../github/GitHubAPIClient.ts';

// Get the set of valid file paths from context (source of truth from preflight)
function getValidFilePaths(context: AuditContext): Set<string> {
    return new Set(context.files.map(f => f.path));
}

// Expand glob patterns to actual file paths (same logic as planner)
function expandFilePatterns(patterns: string[], validFiles: Set<string>): string[] {
    const expanded: string[] = [];

    for (const pattern of patterns) {
        if (pattern.includes('*')) {
            // Glob pattern - convert to regex and match against valid files
            // ** matches any number of directories, * matches within directory
            const regexPattern = '^' +
                pattern
                    .replace(/\*\*/g, '.*')  // ** becomes .*
                    .replace(/\*/g, '[^/]*') // * becomes [^/]*
                    .replace(/\?/g, '[^/]')  // ? becomes [^/] (single char)
                + '$';

            const regex = new RegExp(regexPattern);

            for (const file of validFiles) {
                if (regex.test(file)) {
                    expanded.push(file);
                }
            }
        } else {
            // Exact path
            if (validFiles.has(pattern)) {
                expanded.push(pattern);
            }
        }
    }

    return expanded;
}

// Validate and expand task files against preflight
function validateTargetFiles(
    taskFiles: string[],
    validPaths: Set<string>,
    taskRole: string
): { validFiles: string[]; invalidFiles: string[] } {
    // First expand any glob patterns to actual file paths
    const expandedFiles = expandFilePatterns(taskFiles, validPaths);

    // Then validate that all expanded files exist in preflight
    const validFiles: string[] = [];
    const invalidFiles: string[] = [];

    for (const path of expandedFiles) {
        if (validPaths.has(path)) {
            validFiles.push(path);
        } else {
            invalidFiles.push(path);
        }
    }

    if (invalidFiles.length > 0) {
        console.warn(`🚫 Worker [${taskRole}] attempted to access ${invalidFiles.length} files NOT in preflight:`, invalidFiles.slice(0, 5));
    }

    console.log(`📋 Worker [${taskRole}]: Expanded ${taskFiles.length} patterns to ${validFiles.length} valid files`);
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

            // Handle files without content (large files, empty files, symlinks, etc.)
            if (!fileData.content) {
                console.warn(`⚠️ No content available for ${f.path}:`, {
                    type: fileData.type,
                    size: fileData.size,
                    encoding: fileData.encoding,
                    hasDownloadUrl: !!fileData.download_url,
                    isLargeFile: fileData.size > 1024 * 1024 // > 1MB
                });

                // For large files, try to fetch via download_url
                if (fileData.download_url && fileData.size > 1024 * 1024) {
                    console.log(`📥 Attempting to download large file ${f.path} via download_url`);
                    try {
                        const downloadResponse = await fetch(fileData.download_url, {
                            headers: {
                                'Authorization': `Bearer ${context.githubToken || apiKey}`,
                                'Accept': 'application/vnd.github.v3.raw',
                                'User-Agent': 'SCAI'
                            }
                        });

                        if (downloadResponse.ok) {
                            const content = await downloadResponse.text();
                            console.log(`✅ Successfully downloaded ${f.path} (${content.length} chars)`);
                            return `--- ${f.path} ---\n${content}`;
                        } else {
                            console.error(`❌ Failed to download ${f.path}: ${downloadResponse.status}`);
                        }
                    } catch (downloadError) {
                        console.error(`❌ Download error for ${f.path}:`, downloadError);
                    }
                }

                // Skip files we can't get content for
                console.log(`⏭️ Skipping ${f.path} - no accessible content`);
                return null;
            }

            let content: string;
            // GitHub API returns content as base64
            if (fileData.encoding === 'base64' && fileData.content) {
                content = atob(fileData.content.replace(/\n/g, ''));
            } else if (fileData.content) {
                // Sometimes content is already decoded
                content = fileData.content;
            } else {
                console.error(`🚨 Unexpected: content field exists but is falsy for ${f.path}`);
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

    // 2. Analyze - Ensure we have clear instructions before proceeding
    if (!task.instruction || task.instruction.trim().length === 0) {
        console.error(`🚨 Worker [${task.role}] has no instructions! Cannot proceed.`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "MISSING_INSTRUCTIONS",
                    message: "Worker received no analysis instructions from planner.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    const systemPrompt = `You are a specialized code analysis agent.

YOUR MISSION: ${task.instruction}

Analyze the provided code files according to your mission above. Be thorough and focused on the specific requirements.

While analyzing, also build an "appMap" - a lightweight metadata summary of the project structure you observe.

Return your findings in this exact JSON format:
    {
  "issues": [
    {
      "id": "unique_id",
      "severity": "critical|warning|info",
      "category": "appropriate_category",
      "title": "Brief, clear title",
      "description": "Detailed explanation of the issue",
      "filePath": "filename.ext",
      "line": 42,
      "badCode": "problematic code snippet",
      "remediation": "suggested fix"
    }
  ],
  "topStrengths": ["key strength 1", "key strength 2"],
  "topWeaknesses": ["key weakness 1", "key weakness 2"],
  "appMap": {
    "languages": ["js", "ts"],
    "frameworks": ["react", "node"],
    "directory_count": 24,
    "file_count": 138,
    "complexity": "medium",
    "key_files": ["package.json", "Dockerfile", "src/index.ts"],
    "architecture_patterns": ["modular", "monolithic"],
    "testing_approach": "minimal|moderate|comprehensive",
    "config_approach": "centralized|scattered"
  },
  "localScore": 75
}

The appMap should reflect what you observe about the project structure from the files you analyzed. This metadata helps contextualize your findings.

IMPORTANT: Only analyze the code provided. Do not make assumptions about unshown code.`;

    const userPrompt = `CODE TO ANALYZE (${successfulContent.length} files):

${fileContext}

Analyze these files according to your mission instructions above.`;

    const { data, usage } = await callGemini(apiKey, systemPrompt, userPrompt, 0.2, {
      role: 'WORKER',
      thinkingBudget: 4096 // Fixed budget for workers (less than CEO's dynamic budget)
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
