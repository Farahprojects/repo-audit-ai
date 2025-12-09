import { AuditStats, ComplexityFingerprint } from '../types';
import { supabase } from '../src/integrations/supabase/client';
import { ErrorHandler, ErrorLogger } from './errorService';

export interface FileMapItem {
  path: string;
  size: number;
  type: string; // 'file' | 'dir'
  url?: string; // GitHub raw URL for fetching later
}

// Canonical GitHub repository URL parser - matches backend implementation
export interface GitHubRepo {
  owner: string;
  repo: string;
  normalized: string;
}

export const parseGitHubUrl = (url: string): GitHubRepo | null => {
  if (!url) return null;

  // Normalize whitespace and trim
  let parsedUrl = url.trim();

  // Handle simple owner/repo format first
  if (!parsedUrl.includes('.') && parsedUrl.includes('/')) {
    const parts = parsedUrl.split('/').filter(Boolean);
    if (parts.length === 2) {
      const [owner, repoWithGit] = parts;
      const repo = repoWithGit.replace(/\.git$/, "");
      if (owner && repo) {
        return {
          owner,
          repo,
          normalized: `${owner}/${repo}`,
        };
      }
    }
    return null;
  }

  // Convert SSH to https-like format
  // git@github.com:owner/repo.git
  const sshMatch = parsedUrl.match(/^git@github\.com:(.+)$/);
  if (sshMatch) {
    parsedUrl = "https://github.com/" + sshMatch[1];
  }

  // Add scheme if missing
  if (!parsedUrl.startsWith("http")) {
    parsedUrl = "https://" + parsedUrl;
  }

  try {
    const u = new URL(parsedUrl);

    if (!u.hostname.includes("github.com")) return null;

    // Remove leading/trailing slashes
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");

    if (parts.length < 2) return null;

    const owner = decodeURIComponent(parts[0]);
    let repo = decodeURIComponent(parts[1]);

    // Strip .git
    repo = repo.replace(/\.git$/, "");

    if (!owner || !repo) return null;

    return {
      owner,
      repo,
      normalized: `${owner}/${repo}`,
    };
  } catch {
      return null;
    }
};

/**
 * Fetch repository stats via Supabase github-proxy edge function
 * @param accessToken - Optional GitHub OAuth token for private repos
 */
export const fetchRepoStats = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<AuditStats> => {
  const context = { owner, repo, hasToken: !!accessToken, operation: 'fetchRepoStats' };
  ErrorLogger.info('Starting repository stats fetch', context);

  try {
    // Call github-proxy edge function
    const { data, error } = await supabase.functions.invoke('github-proxy', {
      body: { owner, repo, action: 'stats', userToken: accessToken }
    });

    if (error) {
      ErrorHandler.handleGitHubError(error, 'invoke-github-proxy-stats', context);
    }

    if (data?.error) {
      ErrorLogger.warn('GitHub proxy returned structured error', undefined, { ...context, errorData: data });

      // Handle specific error codes with deterministic logic
      if (data.errorCode === 'RATE_LIMIT') {
        throw new Error('GitHub API rate limit exceeded. Please try again later.');
      }

      if (data.errorCode === 'OWNER_NOT_FOUND') {
        // Owner doesn't exist - URL is definitely wrong
        const error = new Error('Repository owner does not exist. Please check the URL spelling.');
        ErrorLogger.warn('Owner not found', error, context);
        throw error;
      }

      if (data.errorCode === 'PRIVATE_REPO') {
        // Repo exists but is private - we already checked owner exists
        const error = new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
        ErrorLogger.warn('Repository is private', error, context);
        throw error;
      }

      // Handle legacy requiresAuth flag (fallback for any edge cases)
      if (data.requiresAuth && !accessToken) {
        const error = new Error('PRIVATE_REPO:Repository not found or private. Connect GitHub to access private repos.');
        ErrorLogger.warn('Repository requires authentication', error, context);
        throw error;
      }

      // Generic error fallback
      const error = new Error(data.error || 'Unknown GitHub API error');
      ErrorLogger.error('GitHub proxy returned generic error', error, { ...context, errorData: data });
      throw error;
    }

    if (!data || typeof data !== 'object') {
      const error = new Error('Invalid response format from GitHub proxy');
      ErrorLogger.error('GitHub proxy returned invalid data format', error, context);
      throw error;
    }

    ErrorLogger.info('Repository stats fetch completed successfully', { ...context, fileCount: data.files });
    return data as AuditStats;

  } catch (error) {
    // Re-throw if already handled
    if (error instanceof Error) {
      throw error;
    }

    // Handle unexpected errors
    ErrorHandler.handleGitHubError(error, 'fetch-repo-stats', context);
  }
};

/**
 * Fetch repository complexity fingerprint for cost estimation
 * @param accessToken - Optional GitHub OAuth token for private repos
 */
export const fetchRepoFingerprint = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<ComplexityFingerprint> => {

  // Call github-proxy edge function with fingerprint action
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'fingerprint', userToken: accessToken }
  });


  if (error) {
    console.error('❌ [fetchRepoFingerprint] GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to generate fingerprint');
  }

  if (data?.error) {

    // Handle specific error codes - same as fetchRepoStats
    if (data.errorCode === 'OWNER_NOT_FOUND') {
      throw new Error('Repository owner does not exist. Please check the URL spelling.');
    }

    if (data.errorCode === 'PRIVATE_REPO') {
      throw new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
    }

    throw new Error(data.error);
  }

  return data as ComplexityFingerprint;
}

/**
 * UNIFIED PREFLIGHT - Single source of truth
 * Fetch both repository stats and fingerprint in ONE API call.
 * This eliminates race conditions and ensures clean error handling.
 * 
 * @param accessToken - Optional GitHub OAuth token for private repos
 */
export const fetchRepoPreflight = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<{ stats: AuditStats; fingerprint: ComplexityFingerprint; fileMap: FileMapItem[] }> => {

  // Call github-proxy edge function with preflight action
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'preflight', userToken: accessToken }
  });


  if (error) {
    console.error('❌ [fetchRepoPreflight] GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to fetch repository');
  }

  if (data?.error) {

    // Handle specific error codes
    if (data.errorCode === 'RATE_LIMIT') {
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }

    if (data.errorCode === 'OWNER_NOT_FOUND') {
      throw new Error('Repository owner does not exist. Please check the URL spelling.');
    }

    if (data.errorCode === 'PRIVATE_REPO') {
      throw new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
    }

    // Generic error fallback
    throw new Error(data.error);
  }

  // Success - return combined stats + fingerprint + file map
  return {
    stats: data.stats as AuditStats,
    fingerprint: data.fingerprint as ComplexityFingerprint,
    fileMap: data.fileMap as FileMapItem[]
  };
};


/**
 * Fetch repository file map (metadata only) via Supabase github-proxy edge function
 */
export const fetchRepoMap = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<FileMapItem[]> => {
  const context = { owner, repo, hasToken: !!accessToken, operation: 'fetchRepoMap' };
  ErrorLogger.info('Starting repository map fetch', context);

  try {
    // Step 1: Get file tree
    const { data: treeData, error: treeError } = await supabase.functions.invoke('github-proxy', {
      body: { owner, repo, userToken: accessToken }
    });

    if (treeError) {
      ErrorHandler.handleGitHubError(treeError, 'invoke-github-proxy-tree', context);
    }

    if (treeData?.error) {
      const error = new Error(treeData.error || 'GitHub proxy returned error');
      ErrorLogger.error('GitHub proxy tree returned error', error, { ...context, errorData: treeData });
      throw error;
    }

    if (!treeData?.tree) {
      const error = new Error('No file tree data received from GitHub proxy');
      ErrorLogger.error('GitHub proxy returned no tree data', error, context);
      throw error;
    }

    if (treeData.tree.length === 0) {
      const error = new Error('No files found in repository');
      ErrorLogger.warn('Repository appears to be empty', error, context);
      throw error;
    }

    // Step 2: Transform to lightweight map
    const fileMap: FileMapItem[] = treeData.tree
      .filter((f: any) => f.type === 'blob') // Only files, not dirs
      .map((f: any) => ({
        path: f.path,
        size: f.size || 0,
        type: 'file',
        url: f.url // API URL
      }));

    if (fileMap.length === 0) {
      const error = new Error('No code files found in repository (only directories)');
      ErrorLogger.warn('No code files found after filtering', error, { ...context, totalItems: treeData.tree.length });
      throw error;
    }

    ErrorLogger.info('Repository map fetch completed', { ...context, filesMapped: fileMap.length });
    return fileMap;

  } catch (error) {
    // Re-throw if already handled
    if (error instanceof Error) {
      throw error;
    }

    // Handle unexpected errors
    ErrorHandler.handleGitHubError(error, 'fetch-repo-map', context);
  }
};
