/**
 * Database Tools for Universal Orchestrator
 * 
 * Tools for querying and saving data to the database.
 */

import {
    Tool,
    ToolResult,
    ToolContext,
    PermissionLevel
} from '../core/types.ts';

// ============================================================================
// Query Database Tool
// ============================================================================

export const queryDbTool: Tool = {
    name: 'query_db',
    description: 'Query the database for previous audit results, user settings, or cached data. Returns structured data.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            table: {
                type: 'string',
                description: 'Table to query',
                enum: ['audits', 'preflights', 'reasoning_sessions', 'reasoning_steps']
            },
            filters: {
                type: 'object',
                description: 'Key-value pairs for WHERE clause (field: value)'
            },
            select: {
                type: 'string',
                description: 'Columns to select (comma-separated, or * for all)',
                required: false
            },
            limit: {
                type: 'number',
                description: 'Maximum rows to return (default 10)',
                required: false
            },
            orderBy: {
                type: 'string',
                description: 'Column to order by',
                required: false
            }
        },
        required: ['table']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const {
            table,
            filters = {},
            select = '*',
            limit = 10,
            orderBy
        } = input as {
            table: string;
            filters?: Record<string, unknown>;
            select?: string;
            limit?: number;
            orderBy?: string;
        };

        // Validate table name (prevent SQL injection)
        const allowedTables = ['audits', 'preflights', 'reasoning_sessions', 'reasoning_steps', 'repos'];
        if (!allowedTables.includes(table)) {
            return {
                success: false,
                error: `Invalid table: ${table}. Allowed: ${allowedTables.join(', ')}`
            };
        }

        try {
            const supabase = context.supabase as any;
            let query = supabase.from(table).select(select);

            // Apply filters
            for (const [key, value] of Object.entries(filters)) {
                query = query.eq(key, value);
            }

            // Apply ordering
            if (orderBy) {
                const [column, direction] = orderBy.split(':');
                query = query.order(column, { ascending: direction !== 'desc' });
            }

            // Apply limit
            query = query.limit(limit);

            const { data, error } = await query;

            if (error) {
                return {
                    success: false,
                    error: error.message,
                    metadata: { code: error.code }
                };
            }

            return {
                success: true,
                data: {
                    rows: data,
                    count: data?.length || 0,
                    table
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Save Audit Results Tool
// ============================================================================

export const saveAuditResultsTool: Tool = {
    name: 'save_audit_results',
    description: 'Saves audit findings to the database. Use after completing an audit analysis.',
    requiredPermission: PermissionLevel.WRITE,

    inputSchema: {
        type: 'object',
        properties: {
            repoUrl: { type: 'string', description: 'Full GitHub repository URL' },
            healthScore: { type: 'number', description: 'Overall health score (0-100)' },
            summary: { type: 'string', description: 'Executive summary of findings' },
            issues: {
                type: 'array',
                description: 'Array of issue objects with title, description, severity, etc.'
            },
            tier: {
                type: 'string',
                description: 'Audit tier (shape, conventions, security, performance)'
            },
            totalTokens: { type: 'number', description: 'Total tokens used in analysis' },
            extraData: {
                type: 'object',
                description: 'Additional metadata',
                required: false
            }
        },
        required: ['healthScore', 'summary', 'issues']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const {
            repoUrl,
            healthScore,
            summary,
            issues,
            tier,
            totalTokens = 0,
            extraData = {}
        } = input as {
            repoUrl?: string;
            healthScore: number;
            summary: string;
            issues: unknown[];
            tier?: string;
            totalTokens?: number;
            extraData?: Record<string, unknown>;
        };

        const finalRepoUrl = repoUrl || (context.preflight as any)?.repo_url;
        // Tier might not be in preflight, but let's try or require it
        const finalTier = tier || (context.preflight as any)?.tier || 'custom';

        if (!finalRepoUrl) {
            return {
                success: false,
                error: 'repoUrl is required and not found in context'
            };
        }

        try {
            const supabase = context.supabase as any;

            const { data, error } = await supabase
                .from('audits')
                .insert({
                    user_id: context.userId,
                    repo_url: finalRepoUrl,
                    health_score: healthScore,
                    summary,
                    issues,
                    tier: finalTier,
                    total_tokens: totalTokens,
                    extra_data: extraData,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                return {
                    success: false,
                    error: error.message,
                    metadata: { code: error.code }
                };
            }

            return {
                success: true,
                data: {
                    auditId: data.id,
                    savedAt: data.created_at
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Get Preflight Data Tool
// ============================================================================

export const getPreflightTool: Tool = {
    name: 'get_preflight',
    description: 'Retrieves preflight data for a repository including file map and metadata.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            preflightId: { type: 'string', description: 'Preflight record ID (optional if in context)' }
        },
        required: []
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        let { preflightId } = input as { preflightId?: string };

        // Fallback to context if not provided
        if (!preflightId && context.preflight) {
            preflightId = (context.preflight as any).id;
        }

        if (!preflightId) {
            return {
                success: false,
                error: 'No preflightId provided and none found in context'
            };
        }

        try {
            const supabase = context.supabase as any;

            const { data, error } = await supabase
                .from('preflights')
                .select('*')
                .eq('id', preflightId)
                .single();

            if (error) {
                return {
                    success: false,
                    error: error.message,
                    metadata: { code: error.code }
                };
            }

            if (!data) {
                return {
                    success: false,
                    error: `Preflight not found: ${preflightId}`
                };
            }

            return {
                success: true,
                data: {
                    id: data.id,
                    repoUrl: data.repo_url,
                    owner: data.owner,
                    repo: data.repo,
                    defaultBranch: data.default_branch,
                    repoMap: data.repo_map,
                    fileGroups: data.file_groups,
                    stats: data.stats,
                    isPrivate: data.is_private,
                    fileCount: data.file_count
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Get Repo File Tool - Read file from repos table (cached, no GitHub API)
// ============================================================================

export const getRepoFileTool: Tool = {
    name: 'get_repo_file',
    description: 'Read file content from the local repo cache. Use this instead of fetching from GitHub to avoid rate limits. Files are automatically cached during preflight.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file within the repository (e.g., "src/index.ts")'
            },
            repoId: {
                type: 'string',
                description: 'Repository ID (preflight.id). Optional if preflight is in context.'
            }
        },
        required: ['filePath']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { filePath, repoId: inputRepoId } = input as { filePath: string; repoId?: string };

        // Get repo ID from input or context
        const repoId = inputRepoId || (context.preflight as any)?.id;

        if (!repoId) {
            return {
                success: false,
                error: 'No repoId provided and none found in context'
            };
        }

        if (!filePath) {
            return {
                success: false,
                error: 'filePath is required'
            };
        }

        try {
            const supabase = context.supabase as any;

            const { data, error } = await supabase
                .from('repos')
                .select('compressed_content, version, metadata')
                .eq('repo_id', repoId)
                .eq('file_path', filePath)
                .single();

            if (error || !data) {
                return {
                    success: false,
                    error: `File not found in cache: ${filePath}`,
                    metadata: { repoId, filePath }
                };
            }

            // Decompress the content
            try {
                const compressed = new Uint8Array(data.compressed_content);
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

                // Update last_accessed
                await supabase
                    .from('repos')
                    .update({ last_accessed: new Date().toISOString() })
                    .eq('repo_id', repoId)
                    .eq('file_path', filePath);

                return {
                    success: true,
                    data: {
                        filePath,
                        content,
                        version: data.version,
                        metadata: data.metadata
                    }
                };
            } catch (decompressError) {
                return {
                    success: false,
                    error: `Failed to decompress file: ${decompressError instanceof Error ? decompressError.message : 'Unknown error'}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Update Repo File Tool - Write file changes to repos table
// ============================================================================

export const updateRepoFileTool: Tool = {
    name: 'update_repo_file',
    description: 'Update or create a file in the repo cache. Use this to save AI-generated fixes or modifications. Changes are stored in preview_cache until confirmed.',
    requiredPermission: PermissionLevel.WRITE,

    inputSchema: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file within the repository'
            },
            content: {
                type: 'string',
                description: 'New file content'
            },
            repoId: {
                type: 'string',
                description: 'Repository ID (preflight.id). Optional if preflight is in context.'
            },
            previewOnly: {
                type: 'boolean',
                description: 'If true, only update preview_cache without modifying the actual content. Default: false'
            },
            previewData: {
                type: 'object',
                description: 'Additional data to store in preview_cache (e.g., diff, reasoning)'
            }
        },
        required: ['filePath', 'content']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const {
            filePath,
            content,
            repoId: inputRepoId,
            previewOnly = false,
            previewData = {}
        } = input as {
            filePath: string;
            content: string;
            repoId?: string;
            previewOnly?: boolean;
            previewData?: Record<string, unknown>;
        };

        const repoId = inputRepoId || (context.preflight as any)?.id;

        if (!repoId) {
            return {
                success: false,
                error: 'No repoId provided and none found in context'
            };
        }

        if (!filePath || !content) {
            return {
                success: false,
                error: 'filePath and content are required'
            };
        }

        try {
            const supabase = context.supabase as any;

            // Generate hash for change detection
            let hash = 0;
            for (let i = 0; i < content.length; i++) {
                const char = content.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const contentHash = hash.toString(16);

            // Compress content
            const encoder = new TextEncoder();
            const data = encoder.encode(content);

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                }
            });

            const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
            const reader = compressedStream.getReader();
            const chunks: Uint8Array[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }

            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const compressed = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                compressed.set(chunk, offset);
                offset += chunk.length;
            }

            const now = new Date().toISOString();

            if (previewOnly) {
                // Only update preview_cache
                const { error } = await supabase
                    .from('repos')
                    .update({
                        preview_cache: {
                            ...previewData,
                            previewContent: content,
                            previewHash: contentHash,
                            previewAt: now
                        },
                        last_accessed: now
                    })
                    .eq('repo_id', repoId)
                    .eq('file_path', filePath);

                if (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }

                return {
                    success: true,
                    data: {
                        filePath,
                        action: 'preview_updated',
                        contentHash
                    }
                };
            } else {
                // Full update with version increment
                const updateData = {
                    compressed_content: compressed,
                    content_hash: contentHash,
                    preview_cache: previewData,
                    last_updated: now,
                    last_accessed: now
                };

                // Use upsert to handle both update and insert
                const { data: upsertData, error } = await supabase
                    .from('repos')
                    .upsert({
                        repo_id: repoId,
                        repo_name: (context.preflight as any)?.owner + '/' + (context.preflight as any)?.repo || 'unknown',
                        file_path: filePath,
                        ...updateData,
                        version: 1 // Will be incremented by trigger if updating
                    }, {
                        onConflict: 'repo_id,file_path'
                    })
                    .select('version')
                    .single();

                if (error) {
                    return {
                        success: false,
                        error: error.message
                    };
                }

                return {
                    success: true,
                    data: {
                        filePath,
                        action: 'updated',
                        contentHash,
                        version: upsertData?.version
                    }
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Push to GitHub Tool - ONLY for fix mode, commits changes to main repo
// ============================================================================

export const pushToGithubTool: Tool = {
    name: 'push_to_github',
    description: 'Push file changes from repos table to the main GitHub repository. ONLY use in FIX MODE. This is the only way agents can write to GitHub.',
    requiredPermission: PermissionLevel.WRITE,

    inputSchema: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Path to the file to push'
            },
            commitMessage: {
                type: 'string',
                description: 'Commit message for the change'
            },
            repoId: {
                type: 'string',
                description: 'Repository ID (preflight.id). Optional if preflight is in context.'
            },
            branch: {
                type: 'string',
                description: 'Branch to push to. Defaults to default_branch from preflight.'
            }
        },
        required: ['filePath', 'commitMessage']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const {
            filePath,
            commitMessage,
            repoId: inputRepoId,
            branch: inputBranch
        } = input as {
            filePath: string;
            commitMessage: string;
            repoId?: string;
            branch?: string;
        };

        const repoId = inputRepoId || (context.preflight as any)?.id;
        const preflight = context.preflight as any;

        if (!repoId || !preflight) {
            return {
                success: false,
                error: 'No repoId or preflight data found in context'
            };
        }

        if (!filePath || !commitMessage) {
            return {
                success: false,
                error: 'filePath and commitMessage are required'
            };
        }

        // Check if we're in fix mode (this should be validated at a higher level too)
        const isFixMode = (context as any).mode === 'fix' || (context as any).fixMode === true;
        if (!isFixMode) {
            return {
                success: false,
                error: 'push_to_github can ONLY be used in fix mode. Agents cannot push to GitHub during analysis.'
            };
        }

        try {
            const supabase = context.supabase as any;
            const githubClient = (context as any).githubClient;

            if (!githubClient) {
                return {
                    success: false,
                    error: 'No GitHub client available. Fix mode requires authenticated GitHub access.'
                };
            }

            // Get the file content from repos table
            const { data: fileData, error: fetchError } = await supabase
                .from('repos')
                .select('compressed_content, content_hash')
                .eq('repo_id', repoId)
                .eq('file_path', filePath)
                .single();

            if (fetchError || !fileData?.compressed_content) {
                return {
                    success: false,
                    error: `File not found in repos table: ${filePath}`
                };
            }

            // Decompress the content
            const compressed = new Uint8Array(fileData.compressed_content);
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

            // Get the current SHA of the file on GitHub (needed for update)
            // Note: This is the ONLY GitHub fetch allowed - it's just for the SHA, not content
            // Content comes from repos table, SHA is needed for GitHub's update API
            const branch = inputBranch || preflight.default_branch || 'main';
            let currentSha: string | null = null;

            try {
                const fileResponse = await githubClient.fetchFile(
                    preflight.owner,
                    preflight.repo,
                    filePath,
                    branch
                );
                if (fileResponse.ok) {
                    const existingFile = await fileResponse.json();
                    currentSha = existingFile.sha;
                }
            } catch {
                // File doesn't exist yet, will create new
            }

            // Base64 encode the content for GitHub API
            const base64Content = btoa(content);

            // Push to GitHub using the Contents API
            const updatePayload: any = {
                message: commitMessage,
                content: base64Content,
                branch
            };

            if (currentSha) {
                updatePayload.sha = currentSha;
            }

            const pushResponse = await githubClient.updateFile(
                preflight.owner,
                preflight.repo,
                filePath,
                updatePayload
            );

            if (!pushResponse.ok) {
                const errorData = await pushResponse.json();
                return {
                    success: false,
                    error: `GitHub push failed: ${errorData.message || pushResponse.statusText}`
                };
            }

            const pushResult = await pushResponse.json();

            // Clear the preview_cache since file is now committed
            await supabase
                .from('repos')
                .update({
                    preview_cache: {},
                    last_updated: new Date().toISOString()
                })
                .eq('repo_id', repoId)
                .eq('file_path', filePath);

            return {
                success: true,
                data: {
                    filePath,
                    action: 'pushed_to_github',
                    commitSha: pushResult.commit?.sha,
                    branch,
                    message: commitMessage
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Export all DB tools
// ============================================================================

export const dbTools: Tool[] = [
    queryDbTool,
    saveAuditResultsTool,
    getRepoFileTool,
    updateRepoFileTool,
    pushToGithubTool
];
