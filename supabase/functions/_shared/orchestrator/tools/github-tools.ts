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
// Fetch GitHub File Tool - REPLACED with Storage/DB version
// ============================================================================

export const fetchGitHubFileTool: Tool = {
    name: 'fetch_github_file',
    description: 'Fetches the content of a specific file. USES LOCAL STORAGE CACHE (No GitHub API).',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'File path' },
            branch: { type: 'string', description: 'Ignored (uses cached version)', required: false }
        },
        required: ['owner', 'repo', 'path']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { owner, repo, path } = input as { owner: string; repo: string; path: string };

        try {
            const supabase = context.supabase as any;

            // Find repo_id using owner/repo
            const { data: preflightData, error: preflightError } = await supabase
                .from('preflights')
                .select('id')
                .eq('owner', owner)
                .eq('repo', repo)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (preflightError || !preflightData) {
                return { success: false, error: `Repository not found in cache: ${owner}/${repo}` };
            }

            // Delegate to common logic (similar to get_repo_file)
            // Get metadata
            const { data: repoMeta, error: metaError } = await supabase
                .from('repos')
                .select('storage_path, file_index')
                .eq('repo_id', preflightData.id)
                .single();

            if (metaError || !repoMeta?.storage_path) {
                return { success: false, error: 'Repository archive not found in storage' };
            }

            // Download from Storage
            const { data: blob, error: storageError } = await supabase.storage
                .from('repo_archives')
                .download(repoMeta.storage_path);

            if (storageError || !blob) {
                return { success: false, error: 'Failed to download archive from storage' };
            }

            // Import fflate
            const { unzipSync, strFromU8 } = await import('https://esm.sh/fflate@0.8.2');
            const archiveData = new Uint8Array(await blob.arrayBuffer());
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            if (!unzipped[path]) {
                return { success: false, error: `File not found in archive: ${path}` };
            }

            return {
                success: true,
                data: {
                    path,
                    content: strFromU8(unzipped[path]),
                    size: unzipped[path].length,
                    source: 'storage_cache'
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
// List Repository Files Tool - REPLACED with Storage/DB version
// ============================================================================

export const listRepoFilesTool: Tool = {
    name: 'list_repo_files',
    description: 'Lists files in a directory using the LOCALLY CACHED file index. No GitHub API.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            path: { type: 'string', description: 'Directory path (empty for root)' },
            branch: { type: 'string', description: 'Ignored', required: false }
        },
        required: ['owner', 'repo']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { owner, repo, path = '' } = input as { owner: string; repo: string; path?: string };

        try {
            const supabase = context.supabase as any;

            // Find repo_id
            const { data: preflightData, error: preflightError } = await supabase
                .from('preflights')
                .select('id')
                .eq('owner', owner)
                .eq('repo', repo)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (preflightError || !preflightData) {
                return { success: false, error: `Repository not found in cache: ${owner}/${repo}` };
            }

            // Get file index
            const { data: repoMeta, error: metaError } = await supabase
                .from('repos')
                .select('file_index')
                .eq('repo_id', preflightData.id)
                .single();

            if (metaError || !repoMeta?.file_index) {
                return { success: false, error: 'Repository index not found' };
            }

            const fileIndex = repoMeta.file_index as Record<string, { size: number }>;
            const allPaths = Object.keys(fileIndex);

            // Filter by path
            const normalizedPath = path ? (path.endsWith('/') ? path : `${path}/`) : '';
            const items: any[] = [];
            const processedDirs = new Set<string>();

            // Simulate directory listing from flat paths
            for (const filePath of allPaths) {
                if (!filePath.startsWith(normalizedPath)) continue;

                const relative = filePath.slice(normalizedPath.length);
                const parts = relative.split('/');

                if (parts.length === 1) {
                    // It's a file in this dir
                    items.push({
                        name: parts[0],
                        path: filePath,
                        type: 'file',
                        size: fileIndex[filePath].size
                    });
                } else {
                    // It's a subdir
                    const dirName = parts[0];
                    if (!processedDirs.has(dirName)) {
                        processedDirs.add(dirName);
                        items.push({
                            name: dirName,
                            path: normalizedPath + dirName,
                            type: 'dir',
                            size: 0
                        });
                    }
                }
            }

            return {
                success: true,
                data: {
                    path: path || '/',
                    items,
                    count: items.length,
                    source: 'storage_index'
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
