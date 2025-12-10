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

            if (context.githubToken) {
                headers['Authorization'] = `Bearer ${context.githubToken}`;
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

            if (context.githubToken) {
                headers['Authorization'] = `Bearer ${context.githubToken}`;
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

            if (context.githubToken) {
                headers['Authorization'] = `Bearer ${context.githubToken}`;
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
