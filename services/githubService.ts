import { AuditStats, ComplexityFingerprint } from '../types';
import { supabase } from '../src/integrations/supabase/client';

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
  console.log('🔍 [fetchRepoStats] Starting repo analysis for:', `${owner}/${repo}`);
  console.log('🔍 [fetchRepoStats] Access token provided:', !!accessToken);

  // Call github-proxy edge function
  console.log('🔍 [fetchRepoStats] Calling github-proxy edge function...');
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'stats', userToken: accessToken }
  });

  console.log('🔍 [fetchRepoStats] Edge function response:', { data, error });

  if (error) {
    console.error('❌ [fetchRepoStats] GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to fetch repository');
  }

  if (data?.error) {
    console.log('⚠️ [fetchRepoStats] Structured error response:', data);

    // Handle specific error codes with deterministic logic
    if (data.errorCode === 'RATE_LIMIT') {
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }

    if (data.errorCode === 'OWNER_NOT_FOUND') {
      // Owner doesn't exist - URL is definitely wrong
      console.log('❌ [fetchRepoStats] Owner does not exist - URL is wrong');
      throw new Error('Repository owner does not exist. Please check the URL spelling.');
    }

    if (data.errorCode === 'PRIVATE_REPO') {
      // Repo exists but is private - we already checked owner exists
      console.log('🔐 [fetchRepoStats] Repo exists but is private');
      throw new Error('PRIVATE_REPO:Repository exists but is private. Connect your GitHub account to access private repositories.');
    }

    // Handle legacy requiresAuth flag (fallback for any edge cases)
    if (data.requiresAuth && !accessToken) {
      console.log('🔐 [fetchRepoStats] Unauthenticated - could be private repo');
      throw new Error('PRIVATE_REPO:Repository not found or private. Connect GitHub to access private repos.');
    }

    // Generic error fallback
    console.log('❌ [fetchRepoStats] Generic error:', data.error);
    throw new Error(data.error);
  }

  console.log('✅ [fetchRepoStats] Success! Returning stats:', data);
  return data as AuditStats;
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
    console.log('⚠️ [fetchRepoFingerprint] Data contains error:', data.error);
    throw new Error(data.error);
  }

  console.log('✅ [fetchRepoFingerprint] Success! Returning fingerprint:', data);
  return data as ComplexityFingerprint;
};


/**
 * Fetch repository file map (metadata only) via Supabase github-proxy edge function
 */
export const fetchRepoMap = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<FileMapItem[]> => {
  // Step 1: Get file tree
  const { data: treeData, error: treeError } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, userToken: accessToken }
  });

  if (treeError) {
    console.error('GitHub proxy tree error:', treeError);
    throw new Error(treeError.message || 'Failed to fetch repository tree');
  }

  if (treeData?.error) {
    throw new Error(treeData.error);
  }

  if (!treeData?.tree || treeData.tree.length === 0) {
    throw new Error('No code files found in repository');
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

  console.log(`🗺️ Generated map for ${fileMap.length} files`);
  return fileMap;
};
