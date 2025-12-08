import { AuditStats, ComplexityFingerprint } from '../types';
import { supabase } from '../src/integrations/supabase/client';
import { ErrorHandler, ErrorLogger } from './errorService';

interface FileMapItem {
  path: string;
  size: number;
  type: string; // 'file' | 'dir'
  url?: string; // GitHub raw URL for fetching later
}

export const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  console.log('🔗 [parseGitHubUrl] Parsing URL:', url);

  if (!url || !url.trim()) {
    console.log('❌ [parseGitHubUrl] Empty URL provided');
    return null;
  }

  // Remove any trailing slashes
  const cleanUrl = url.trim().replace(/\/+$/, '');
  console.log('🔗 [parseGitHubUrl] Cleaned URL:', cleanUrl);

  try {
    const urlObj = new URL(cleanUrl);
    console.log('🔗 [parseGitHubUrl] Full URL detected, hostname:', urlObj.hostname);

    // Check if it's a GitHub URL
    if (!urlObj.hostname.includes('github.com')) {
      console.log('❌ [parseGitHubUrl] Not a GitHub URL:', urlObj.hostname);
      return null;
    }

    const parts = urlObj.pathname.split('/').filter(Boolean);
    console.log('🔗 [parseGitHubUrl] Path parts:', parts);

    if (parts.length === 1) {
      console.log('❌ [parseGitHubUrl] Missing repository name - only owner provided:', parts[0]);
      return null;
    }

    if (parts.length >= 2) {
      const result = { owner: parts[0], repo: parts[1] };
      console.log('✅ [parseGitHubUrl] Successfully parsed:', result);
      return result;
    }
  } catch (e) {
    console.log('🔄 [parseGitHubUrl] URL parsing failed, trying simple format');
    // Try parsing as owner/repo format (without https://github.com/)
    const parts = cleanUrl.split('/').filter(Boolean);
    console.log('🔗 [parseGitHubUrl] Simple format parts:', parts);

    if (parts.length === 1) {
      console.log('❌ [parseGitHubUrl] Simple format missing repository name - only owner provided:', parts[0]);
      return null;
    }

    if (parts.length === 2) {
      const result = { owner: parts[0], repo: parts[1] };
      console.log('✅ [parseGitHubUrl] Successfully parsed simple format:', result);
      return result;
    }
  }

  console.log('❌ [parseGitHubUrl] Failed to parse URL - invalid format');
  return null;
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
  console.log('🔍 [fetchRepoFingerprint] Starting fingerprint generation for:', `${owner}/${repo}`);

  // Call github-proxy edge function with fingerprint action
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'fingerprint', userToken: accessToken }
  });

  console.log('🔍 [fetchRepoFingerprint] Edge function response:', { data, error });

  if (error) {
    console.error('❌ [fetchRepoFingerprint] GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to generate fingerprint');
  }

  if (data?.error) {
    console.log('⚠️ [fetchRepoFingerprint] Structured error response:', data);

    // Handle specific error codes - same as fetchRepoStats
    if (data.errorCode === 'OWNER_NOT_FOUND') {
      throw new Error('Repository owner does not exist. Please check the URL spelling.');
    }

    if (data.errorCode === 'PRIVATE_REPO') {
      throw new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
    }

    throw new Error(data.error);
  }

  console.log('✅ [fetchRepoFingerprint] Success! Returning fingerprint:', data);
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
): Promise<{ stats: AuditStats; fingerprint: ComplexityFingerprint }> => {
  console.log('🚀 [fetchRepoPreflight] Starting unified preflight for:', `${owner}/${repo}`);
  console.log('🚀 [fetchRepoPreflight] Access token provided:', !!accessToken);

  // Call github-proxy edge function with preflight action
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'preflight', userToken: accessToken }
  });

  console.log('🚀 [fetchRepoPreflight] Edge function response:', { data, error });

  if (error) {
    console.error('❌ [fetchRepoPreflight] GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to fetch repository');
  }

  if (data?.error) {
    console.log('⚠️ [fetchRepoPreflight] Structured error response:', data);

    // Handle specific error codes
    if (data.errorCode === 'RATE_LIMIT') {
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }

    if (data.errorCode === 'OWNER_NOT_FOUND') {
      console.log('❌ [fetchRepoPreflight] Owner does not exist - URL is wrong');
      throw new Error('Repository owner does not exist. Please check the URL spelling.');
    }

    if (data.errorCode === 'PRIVATE_REPO') {
      console.log('🔐 [fetchRepoPreflight] Repo exists but is private');
      throw new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
    }

    // Generic error fallback
    console.log('❌ [fetchRepoPreflight] Generic error:', data.error);
    throw new Error(data.error);
  }

  // Success - return combined stats + fingerprint
  console.log('✅ [fetchRepoPreflight] Success! Returning combined data');
  return {
    stats: data.stats as AuditStats,
    fingerprint: data.fingerprint as ComplexityFingerprint
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
