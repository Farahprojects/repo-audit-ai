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
