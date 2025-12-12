
import { AuditContext, WorkerTask, WorkerResult } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

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

    // =========================================================================
    // LOAD FILES FROM REPO ARCHIVE
    // Agents have NO GitHub API access - all files come from the stored archive
    // =========================================================================
    const supabase = context.supabase;

    if (!supabase) {
        console.error(`🚨 Worker [${task.role}] has no supabase client - cannot fetch files!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "NO_DATABASE_CLIENT",
                    message: "Cannot fetch files without database access. Ensure supabase is passed in context.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // Import fflate for unzip
    const { unzipSync, strFromU8 } = await import('https://esm.sh/fflate@0.8.2');

    // Load the entire repo archive once
    const { data: repoData, error: repoError } = await supabase
        .from('repos')
        .select('archive_blob, file_index')
        .eq('repo_id', context.preflight!.id)
        .single();

    if (repoError || !repoData?.archive_blob) {
        console.error(`🚨 Worker [${task.role}] could not load repo archive!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "REPO_NOT_FOUND",
                    message: "Repository archive not found in database. Ensure preflight downloaded the repo.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    // Unzip the archive once
    const archiveData = new Uint8Array(repoData.archive_blob);
    const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

    console.log(`📦 Worker [${task.role}] loaded repo archive, extracting ${filesToFetch.length} files...`);

    // Extract each requested file
    const fetchedContent: (string | null)[] = [];
    for (const f of filesToFetch) {
        try {
            if (!unzipped[f.path]) {
                console.warn(`⚠️ File not in archive: ${f.path}`);
                fetchedContent.push(null);
                continue;
            }

            const content = strFromU8(unzipped[f.path]!);
            if (!content || content.trim().length === 0) {
                console.warn(`⚠️ Empty content for ${f.path}`);
                fetchedContent.push(null);
                continue;
            }

            console.log(`📄 Extracted ${f.path}`);
            fetchedContent.push(`--- ${f.path} ---\n${content}`);
        } catch (err) {
            console.error(`🚨 Failed to extract ${f.path}:`, err);
            fetchedContent.push(null);
        }
    }

    // Update last_accessed (fire and forget)
    supabase
        .from('repos')
        .update({ last_accessed: new Date().toISOString() })
        .eq('repo_id', context.preflight!.id)
        .then(() => { });

    // Filter out failed fetches
    const successfulContent = fetchedContent.filter(Boolean) as string[];

    // CRITICAL: If ALL file fetches failed, do NOT proceed with LLM analysis
    if (successfulContent.length === 0) {
        console.error(`🚨 Worker [${task.role}] could not load ANY files from repos table!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "FILES_NOT_IN_DATABASE",
                    message: `Could not retrieve any of the ${filesToFetch.length} files from repos table. Ensure preflight completed successfully and files were stored.`,
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
