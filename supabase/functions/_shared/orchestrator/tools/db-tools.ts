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
        const allowedTables = ['audits', 'preflights', 'reasoning_sessions', 'reasoning_steps'];
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
// Export all DB tools
// ============================================================================

export const dbTools: Tool[] = [
    queryDbTool,
    saveAuditResultsTool,
    getPreflightTool
];
