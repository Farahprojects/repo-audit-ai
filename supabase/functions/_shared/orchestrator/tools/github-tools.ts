/**
 * GitHub Tools for Universal Orchestrator
 * 
 * Tools for interacting with GitHub repositories.
 */

import {
    Tool,
    ToolResult,
    ToolContext,
    PermissionLevel,
    ToolInputSchema
} from '../core/types.ts';

// ============================================================================
// Token Helpers
// ============================================================================

async function getGitHubToken(supabase: any, userId?: string, preflight?: any): Promise<string | undefined> {
    // 1. Prefer preflight's github_account_id if available (more specific)
    if (preflight?.github_account_id) {
        try {
            const { data } = await supabase
                .from('github_accounts')
                .select('access_token_encrypted')
                .eq('id', preflight.github_account_id)
                .maybeSingle();

            if (data?.access_token_encrypted) {
                const decrypted = await decryptToken(data.access_token_encrypted);
                if (decrypted) return decrypted;
            }
        } catch (error) {
            console.warn('Failed to fetch/decrypt GitHub token from preflight:', error);
        }
    }

    // 2. Fallback to userId lookup
    if (!userId) return undefined;

    try {
        const { data } = await supabase
            .from('github_accounts')
            .select('access_token_encrypted')
            .eq('user_id', userId)
            .maybeSingle();

        if (!data?.access_token_encrypted) return undefined;

        const decrypted = await decryptToken(data.access_token_encrypted);
        return decrypted || undefined;
    } catch (error) {
        console.warn('Failed to fetch/decrypt GitHub token from user:', error);
        return undefined;
    }
}

async function decryptToken(encryptedToken: string): Promise<string | null> {
    const secret = Deno.env.get('TOKEN_ENCRYPTION_KEY');
    if (!secret) {
        console.error('TOKEN_ENCRYPTION_KEY not set');
        return null;
    }

    try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encrypted = combined.slice(28);

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );

        return decoder.decode(decrypted);
    } catch (decryptError) {
        console.error('Failed to decrypt GitHub token:', decryptError);
        return null;
    }
}

// ============================================================================
// Fetch GitHub File Tool
// ============================================================================

export const fetchGitHubFileTool: Tool = {
    name: 'fetch_github_file',
    description: 'Fetches the content of a specific file from a GitHub repository. Use this when you need to read code, configs, or documentation.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner (user or org)' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'File path within the repository' },
            branch: { type: 'string', description: 'Branch name (defaults to main)', required: false }
        },
        required: ['owner', 'repo', 'path']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { owner, repo, path, branch = 'main' } = input as {
            owner: string;
            repo: string;
            path: string;
            branch?: string;
        };

        try {
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'SCAI-Orchestrator'
            };

            const token = await getGitHubToken(context.supabase, context.userId, context.preflight);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            const response = await fetch(url, { headers });

            if (!response.ok) {
                if (response.status === 404) {
                    return {
                        success: false,
                        error: `File not found: ${path}`,
                        metadata: { statusCode: 404 }
                    };
                }
                if (response.status === 401 || response.status === 403) {
                    return {
                        success: false,
                        error: 'Authentication required for this repository',
                        metadata: { statusCode: response.status }
                    };
                }
                return {
                    success: false,
                    error: `GitHub API error: ${response.status}`,
                    metadata: { statusCode: response.status }
                };
            }

            const data = await response.json();

            // Decode base64 content
            let content: string;
            if (data.encoding === 'base64' && data.content) {
                content = atob(data.content.replace(/\n/g, ''));
            } else {
                content = data.content || '';
            }

            return {
                success: true,
                data: {
                    path: data.path,
                    content,
                    size: data.size,
                    sha: data.sha
                },
                metadata: { encoding: data.encoding }
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
// List Repository Files Tool
// ============================================================================

export const listRepoFilesTool: Tool = {
    name: 'list_repo_files',
    description: 'Lists files and directories in a GitHub repository path. Use this to explore repository structure.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner (user or org)' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'Directory path (empty for root)', required: false },
            branch: { type: 'string', description: 'Branch name (defaults to main)', required: false }
        },
        required: ['owner', 'repo']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { owner, repo, path = '', branch = 'main' } = input as {
            owner: string;
            repo: string;
            path?: string;
            branch?: string;
        };

        try {
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'SCAI-Orchestrator'
            };

            const token = await getGitHubToken(context.supabase, context.userId, context.preflight);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            const response = await fetch(url, { headers });

            if (!response.ok) {
                return {
                    success: false,
                    error: `GitHub API error: ${response.status}`,
                    metadata: { statusCode: response.status }
                };
            }

            const data = await response.json();

            // GitHub returns an array for directories
            if (!Array.isArray(data)) {
                return {
                    success: false,
                    error: 'Path is a file, not a directory. Use fetch_github_file instead.',
                    metadata: { type: data.type }
                };
            }

            const files = data.map((item: any) => ({
                name: item.name,
                path: item.path,
                type: item.type, // 'file' or 'dir'
                size: item.size
            }));

            return {
                success: true,
                data: {
                    path: path || '/',
                    items: files,
                    count: files.length
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
// Get Repository Info Tool
// ============================================================================

export const getRepoInfoTool: Tool = {
    name: 'get_repo_info',
    description: 'Gets metadata about a GitHub repository including languages, stars, and default branch.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner (user or org)' },
            repo: { type: 'string', description: 'Repository name' }
        },
        required: ['owner', 'repo']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { owner, repo } = input as { owner: string; repo: string };

        try {
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'SCAI-Orchestrator'
            };

            const token = await getGitHubToken(context.supabase, context.userId, context.preflight);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Get repo info
            const repoResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}`,
                { headers }
            );

            if (!repoResponse.ok) {
                return {
                    success: false,
                    error: `GitHub API error: ${repoResponse.status}`,
                    metadata: { statusCode: repoResponse.status }
                };
            }

            const repoData = await repoResponse.json();

            // Get languages
            const langResponse = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/languages`,
                { headers }
            );

            let languages = {};
            if (langResponse.ok) {
                languages = await langResponse.json();
            }

            return {
                success: true,
                data: {
                    name: repoData.name,
                    fullName: repoData.full_name,
                    description: repoData.description,
                    defaultBranch: repoData.default_branch,
                    isPrivate: repoData.private,
                    languages,
                    stars: repoData.stargazers_count,
                    forks: repoData.forks_count,
                    size: repoData.size,
                    createdAt: repoData.created_at,
                    updatedAt: repoData.updated_at
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
// Export all GitHub tools
// ============================================================================

export const githubTools: Tool[] = [
    fetchGitHubFileTool,
    listRepoFilesTool,
    getRepoInfoTool
];
