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

        // Validate user context for security
        if (!context.userId) {
            return {
                success: false,
                error: 'User context required for database queries'
            };
        }

        try {
            const supabase = context.supabase as any;
            let query = supabase.from(table).select(select);

            // Apply automatic user-based authorization filters
            switch (table) {
                case 'preflights':
                    // Direct user_id filter
                    query = query.eq('user_id', context.userId);
                    break;
                case 'repos':
                    // Filter through preflights relationship
                    query = query
                        .select(`${select}, preflights!inner(user_id)`)
                        .eq('preflights.user_id', context.userId);
                    break;
                case 'audits':
                    // Assuming 'audits' refers to audit_complete_data
                    query = query.eq('user_id', context.userId);
                    break;
                case 'reasoning_sessions':
                    // Direct user_id filter
                    query = query.eq('user_id', context.userId);
                    break;
                case 'reasoning_steps':
                    // Filter through session ownership (steps are owned by sessions)
                    query = query
                        .select(`${select}, reasoning_sessions!inner(user_id)`)
                        .eq('reasoning_sessions.user_id', context.userId);
                    break;
                default:
                    // For any other tables, require explicit user_id in filters
                    if (!filters['user_id']) {
                        return {
                            success: false,
                            error: `Table '${table}' requires explicit user_id filter for security`
                        };
                    }
                    break;
            }

            // Apply additional filters
            for (const [key, value] of Object.entries(filters)) {
                // Skip user_id filter if already applied automatically
                if (key === 'user_id' && ['preflights', 'audits', 'reasoning_sessions'].includes(table)) {
                    continue;
                }
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
                .from('audit_complete_data')
                .insert({
                    user_id: context.userId,
                    repo_url: finalRepoUrl,
                    health_score: healthScore,
                    summary,
                    issues,
                    tier: finalTier,
                    total_tokens: totalTokens,
                    extra_data: extraData,
                    estimated_tokens: totalTokens, // Map total_tokens to estimated_tokens for compatibility
                    results_chunked: false,
                    complete_data: null
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
// Get Repo File Tool - Extract file from stored repo archive
// ============================================================================

export const getRepoFileTool: Tool = {
    name: 'get_repo_file',
    description: 'Read file content from the stored repo archive. Use this to read files - no GitHub API calls needed.',
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

        // Validate user context for security
        if (!context.userId) {
            return {
                success: false,
                error: 'User context required for repository access'
            };
        }

        try {
            const supabase = context.supabase as any;

            // First, validate that the user owns this preflight/repo
            const { data: ownershipCheck, error: ownershipError } = await supabase
                .from('preflights')
                .select('id')
                .eq('id', repoId)
                .eq('user_id', context.userId)
                .single();

            if (ownershipError || !ownershipCheck) {
                return {
                    success: false,
                    error: 'Access denied: Repository not owned by user'
                };
            }

            // Get storage path from DB
            const { data: repoMeta, error: metaError } = await supabase
                .from('repos')
                .select('storage_path, file_index')
                .eq('repo_id', repoId)
                .single();

            if (metaError || !repoMeta?.storage_path) {
                return {
                    success: false,
                    error: `Repository archive not found`,
                    metadata: { repoId }
                };
            }

            // Check file exists in index first (fast fail)
            const fileIndex = repoMeta.file_index as Record<string, { size: number; hash: string; type: string }>;
            if (!fileIndex[filePath]) {
                return {
                    success: false,
                    error: `File not found in repository: ${filePath}`,
                    metadata: { repoId, availableFiles: Object.keys(fileIndex).slice(0, 10) }
                };
            }

            // Download from Storage
            const { data: blob, error: storageError } = await supabase.storage
                .from('repo_archives')
                .download(repoMeta.storage_path);

            if (storageError || !blob) {
                return {
                    success: false,
                    error: `Failed to download archive from storage: ${storageError?.message}`
                };
            }

            // Import fflate and extract file
            const { unzipSync, strFromU8 } = await import('https://esm.sh/fflate@0.8.2');

            const archiveData = new Uint8Array(await blob.arrayBuffer());
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            if (!unzipped[filePath]) {
                return {
                    success: false,
                    error: `File not in archive: ${filePath}`
                };
            }

            const content = strFromU8(unzipped[filePath]);

            // Update last_accessed (fire and forget)
            supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .then(() => { });

            return {
                success: true,
                data: {
                    filePath,
                    content,
                    size: fileIndex[filePath].size,
                    type: fileIndex[filePath].type
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
// Update Repo File Tool - Modify file within stored repo archive
// ============================================================================

export const updateRepoFileTool: Tool = {
    name: 'update_repo_file',
    description: 'Update a file in the repo archive. The archive is re-compressed with the modified file.',
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
            }
        },
        required: ['filePath', 'content']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { filePath, content, repoId: inputRepoId } = input as {
            filePath: string;
            content: string;
            repoId?: string;
        };

        const repoId = inputRepoId || (context.preflight as any)?.id;

        if (!repoId) {
            return { success: false, error: 'No repoId provided and none found in context' };
        }

        if (!filePath || !content) {
            return { success: false, error: 'filePath and content are required' };
        }

        // Validate user context for security
        if (!context.userId) {
            return {
                success: false,
                error: 'User context required for repository access'
            };
        }

        try {
            const supabase = context.supabase as any;

            // First, validate that the user owns this preflight/repo
            const { data: ownershipCheck, error: ownershipError } = await supabase
                .from('preflights')
                .select('id')
                .eq('id', repoId)
                .eq('user_id', context.userId)
                .single();

            if (ownershipError || !ownershipCheck) {
                return {
                    success: false,
                    error: 'Access denied: Repository not owned by user'
                };
            }

            // Get current meta
            const { data: repoMeta, error: metaError } = await supabase
                .from('repos')
                .select('storage_path, file_index')
                .eq('repo_id', repoId)
                .single();

            if (metaError || !repoMeta?.storage_path) {
                return { success: false, error: 'Repository archive not found' };
            }

            // Download from Storage
            const { data: blob, error: storageError } = await supabase.storage
                .from('repo_archives')
                .download(repoMeta.storage_path);

            if (storageError || !blob) {
                return { success: false, error: 'Failed to download archive from storage' };
            }

            // Import fflate
            const { unzipSync, zipSync, strToU8 } = await import('https://esm.sh/fflate@0.8.2');

            // Unzip current archive
            const archiveData = new Uint8Array(await blob.arrayBuffer());
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            // Update the file
            const contentBytes = strToU8(content);
            unzipped[filePath] = contentBytes;

            // Generate hash
            let hash = 0;
            for (let i = 0; i < contentBytes.length; i++) {
                hash = ((hash << 5) - hash) + contentBytes[i]!;
                hash = hash & hash;
            }
            const contentHash = hash.toString(16);

            // Update file index
            const fileIndex = repoMeta.file_index as Record<string, { size: number; hash: string; type: string }>;
            const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
            fileIndex[filePath] = {
                size: contentBytes.length,
                hash: contentHash,
                type: ext
            };

            // Re-compress
            const recompressed = zipSync(unzipped, { level: 6 });

            // Generate archive hash
            let archiveHashNum = 0;
            for (let i = 0; i < recompressed.length; i++) {
                archiveHashNum = ((archiveHashNum << 5) - archiveHashNum) + (recompressed[i] || 0);
                archiveHashNum = archiveHashNum & archiveHashNum;
            }
            const archiveHash = archiveHashNum.toString(16);

            // Upload back to Storage
            const { error: uploadError } = await supabase.storage
                .from('repo_archives')
                .upload(repoMeta.storage_path, recompressed, {
                    contentType: 'application/zip',
                    upsert: true
                });

            if (uploadError) {
                return { success: false, error: `Upload failed: ${uploadError.message}` };
            }

            // Update DB meta
            const { error: updateError } = await supabase
                .from('repos')
                .update({
                    archive_hash: archiveHash,
                    archive_size: recompressed.length,
                    file_index: fileIndex,
                    last_accessed: new Date().toISOString(),
                    last_updated: new Date().toISOString()
                })
                .eq('repo_id', repoId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }

            return {
                success: true,
                data: {
                    filePath,
                    action: 'updated',
                    contentHash,
                    newArchiveSize: recompressed.length
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
// Push to GitHub Tool - ONLY for fix mode, commits changes to main repo
// ============================================================================

export const pushToGithubTool: Tool = {
    name: 'push_to_github',
    description: 'Push file changes from repo archive to GitHub. ONLY use in FIX MODE.',
    requiredPermission: PermissionLevel.WRITE,

    inputSchema: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: 'Path to the file to push' },
            commitMessage: { type: 'string', description: 'Commit message' },
            repoId: { type: 'string', description: 'Repository ID (optional if in context)' },
            branch: { type: 'string', description: 'Branch to push to (optional)' }
        },
        required: ['filePath', 'commitMessage']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { filePath, commitMessage, repoId: inputRepoId, branch: inputBranch } = input as {
            filePath: string;
            commitMessage: string;
            repoId?: string;
            branch?: string;
        };

        const repoId = inputRepoId || (context.preflight as any)?.id;
        const preflight = context.preflight as any;

        if (!repoId || !preflight) {
            return { success: false, error: 'No repoId or preflight data found in context' };
        }

        if (!filePath || !commitMessage) {
            return { success: false, error: 'filePath and commitMessage are required' };
        }

        // Validate user context for security
        if (!context.userId) {
            return {
                success: false,
                error: 'User context required for repository access'
            };
        }

        // Check fix mode
        const isFixMode = (context as any).mode === 'fix' || (context as any).fixMode === true;
        if (!isFixMode) {
            return { success: false, error: 'push_to_github can ONLY be used in fix mode.' };
        }

        // Validate that the user owns this preflight/repo
        try {
            const supabase = context.supabase as any;
            const { data: ownershipCheck, error: ownershipError } = await supabase
                .from('preflights')
                .select('id')
                .eq('id', repoId)
                .eq('user_id', context.userId)
                .single();

            if (ownershipError || !ownershipCheck) {
                return {
                    success: false,
                    error: 'Access denied: Repository not owned by user'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'Failed to validate repository ownership'
            };
        }

        try {
            const supabase = context.supabase as any;
            const githubClient = (context as any).githubClient;

            if (!githubClient) {
                return { success: false, error: 'No GitHub client available.' };
            }

            // Get storage path from DB
            const { data: repoMeta, error: metaError } = await supabase
                .from('repos')
                .select('storage_path')
                .eq('repo_id', repoId)
                .single();

            if (metaError || !repoMeta?.storage_path) {
                return { success: false, error: 'Repository archive not found' };
            }

            // Download from Storage
            const { data: blob, error: storageError } = await supabase.storage
                .from('repo_archives')
                .download(repoMeta.storage_path);

            if (storageError || !blob) {
                return { success: false, error: 'Failed to download archive from storage' };
            }

            // Import fflate and extract file
            const { unzipSync, strFromU8 } = await import('https://esm.sh/fflate@0.8.2');

            const archiveData = new Uint8Array(await blob.arrayBuffer());
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            if (!unzipped[filePath]) {
                return { success: false, error: `File not in archive: ${filePath}` };
            }

            const content = strFromU8(unzipped[filePath]);

            // Get current SHA from GitHub (needed for update)
            const branch = inputBranch || preflight.default_branch || 'main';
            let currentSha: string | null = null;

            try {
                const fileResponse = await githubClient.fetchFile(
                    preflight.owner, preflight.repo, filePath, branch
                );
                if (fileResponse.ok) {
                    const existingFile = await fileResponse.json();
                    currentSha = existingFile.sha;
                }
            } catch {
                // File doesn't exist yet
            }

            // Push to GitHub
            const base64Content = btoa(content);
            const updatePayload: any = { message: commitMessage, content: base64Content, branch };
            if (currentSha) updatePayload.sha = currentSha;

            const pushResponse = await githubClient.updateFile(
                preflight.owner, preflight.repo, filePath, updatePayload
            );

            if (!pushResponse.ok) {
                const errorData = await pushResponse.json();
                return { success: false, error: `GitHub push failed: ${errorData.message}` };
            }

            const pushResult = await pushResponse.json();

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
            return { success: false, error: error instanceof Error ? error.message : String(error) };
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
