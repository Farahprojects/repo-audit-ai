
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

    // Fetch files ONLY from repos table - agents have NO GitHub fetch access
    // GitHub is only for pushing code in fix mode, never for fetching
    const supabase = context.supabase;

    if (!supabase) {
        console.error(`🚨 Worker [${task.role}] has no supabase client - cannot fetch files from repos table!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "NO_DATABASE_CLIENT",
                    message: "Cannot fetch files without database access. This is a system error.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    if (!context.preflight?.id) {
        console.error(`🚨 Worker [${task.role}] has no preflight ID - cannot fetch files!`);
        return {
            result: {
                taskId: task.id,
                findings: {
                    error: "NO_PREFLIGHT_ID",
                    message: "Cannot fetch files without preflight ID. Ensure preflight was created first.",
                    analysis: null,
                    issues: []
                },
                tokenUsage: 0
            },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
    }

    const fetchedContent = await Promise.all(filesToFetch.map(async f => {
        try {
            const { data: cached, error } = await supabase
                .from('repos')
                .select('compressed_content')
                .eq('repo_id', context.preflight!.id)
                .eq('file_path', f.path)
                .single();

            if (error || !cached?.compressed_content) {
                console.warn(`⚠️ File not found in repos table: ${f.path}`);
                return null;
            }

            // Decompress the cached content
            try {
                const compressed = new Uint8Array(cached.compressed_content);
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(compressed);
                        controller.close();
                    }
                });

                const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
                const reader = decompressedStream.getReader();
                const chunks: Uint8Array[] = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }

                const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                const result = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }

                const decoder = new TextDecoder();
                const content = decoder.decode(result);

                if (content && content.trim().length > 0) {
                    console.log(`📦 Loaded ${f.path} from repos table`);
                    // Update last_accessed asynchronously (fire and forget)
                    supabase
                        .from('repos')
                        .update({ last_accessed: new Date().toISOString() })
                        .eq('repo_id', context.preflight!.id)
                        .eq('file_path', f.path)
                        .then(() => { });
                    return `--- ${f.path} ---\n${content}`;
                }

                console.warn(`⚠️ Empty content in repos table for ${f.path}`);
                return null;
            } catch (decompressErr) {
                console.error(`🚨 Failed to decompress ${f.path}:`, decompressErr);
                return null;
            }
        } catch (err) {
            console.error(`🚨 Database error fetching ${f.path}:`, err);
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
