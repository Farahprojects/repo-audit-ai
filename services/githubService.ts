import { AuditStats } from '../types';
import { supabase } from '../src/integrations/supabase/client';

interface FileContent {
  path: string;
  content: string;
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
    console.log('⚠️ [fetchRepoStats] Data contains error:', data.error);
    console.log('🔍 [fetchRepoStats] Analyzing error type...');

    if (data.error.includes('rate limit')) {
      console.log('⏱️ [fetchRepoStats] Rate limit detected');
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }

    // Check for specific HTTP status codes in the error message
    const statusMatch = data.error.match(/Repository not found: (\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

    console.log('🔍 [fetchRepoStats] Error analysis:', {
      originalError: data.error,
      extractedStatusCode: statusCode,
      hasAuthToken: !!accessToken
    });

    if (statusCode) {
      switch (statusCode) {
        case 401:
          console.log('🔐 [fetchRepoStats] 401 Unauthorized - could be private repo or invalid auth');
          // 401 can mean: repo is private, bad credentials, or repo doesn't exist
          throw new Error('PRIVATE_REPO:Repository not found or private. Connect GitHub to access private repos.');

        case 403:
          console.log('🚫 [fetchRepoStats] 403 Forbidden - access denied');
          throw new Error('PRIVATE_REPO:Access denied to repository. You may need to connect your GitHub account.');

        case 404:
          console.log('❌ [fetchRepoStats] 404 Not Found - repository doesn\'t exist');
          throw new Error('Repository not found. Please check the URL and try again.');

        default:
          console.log(`❓ [fetchRepoStats] Other status ${statusCode}`);
          throw new Error(`GitHub API error (${statusCode}). Please try again.`);
      }
    }

    // Fallback for errors without status codes
    const isPrivateError = data.error.includes('404') || data.error.includes('401') || data.error.includes('403') || data.error.includes('Not Found') || data.error.includes('Forbidden');
    console.log('🔐 [fetchRepoStats] Fallback private repo check:', {
      error: data.error,
      isPrivateError
    });

    if (isPrivateError) {
      console.log('🔐 [fetchRepoStats] Treating as private/access error');
      throw new Error('PRIVATE_REPO:Repository not found or private. Connect GitHub to access private repos.');
    }

    console.log('❌ [fetchRepoStats] Throwing generic error:', data.error);
    throw new Error(data.error);
  }

  console.log('✅ [fetchRepoStats] Success! Returning stats:', data);
  return data as AuditStats;
};


/**
 * Fetch repository files via Supabase github-proxy edge function
 * @param accessToken - Optional GitHub OAuth token for private repos
 */
export const fetchRepoFiles = async (
  owner: string,
  repo: string,
  accessToken?: string
): Promise<FileContent[]> => {
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

  // Step 2: Prioritize files for analysis
  const allFiles = treeData.tree;

  // Config files (always include)
  const configFiles = allFiles.filter((f: any) =>
    f.path.endsWith('package.json') ||
    f.path.endsWith('requirements.txt') ||
    f.path.endsWith('Dockerfile') ||
    f.path.endsWith('docker-compose.yml') ||
    f.path.endsWith('tsconfig.json')
  );

  // Source files (prioritize src/, lib/, app/, components/)
  const sourceFiles = allFiles.filter((f: any) =>
    (f.path.includes('src/') || f.path.includes('lib/') || f.path.includes('app/') || f.path.includes('components/') || f.path.includes('pages/')) &&
    (f.path.endsWith('.ts') || f.path.endsWith('.tsx') || f.path.endsWith('.js') || f.path.endsWith('.jsx') || f.path.endsWith('.py'))
  ).slice(0, 10);

  // Supabase/Edge functions
  const supabaseFiles = allFiles.filter((f: any) =>
    f.path.includes('supabase/') && f.path.endsWith('.ts')
  ).slice(0, 5);

  const filesToFetch = [...configFiles, ...sourceFiles, ...supabaseFiles].slice(0, 15);

  // Step 3: Fetch file contents via proxy
  const contents = await Promise.all(filesToFetch.map(async (file: any) => {
    try {
      const { data: fileData, error: fileError } = await supabase.functions.invoke('github-proxy', {
        body: { owner, repo, filePath: file.path, userToken: accessToken }
      });

      if (fileError || fileData?.error) {
        console.warn(`Failed to fetch ${file.path}:`, fileError || fileData?.error);
        return null;
      }

      return {
        path: file.path,
        content: fileData.content
      };
    } catch (e) {
      console.warn(`Error fetching ${file.path}:`, e);
      return null;
    }
  }));

  const validContents = contents.filter(Boolean) as FileContent[];

  if (validContents.length === 0) {
    throw new Error('Could not fetch any files from repository');
  }

  console.log(`📁 Fetched ${validContents.length} files via Supabase proxy`);
  return validContents;
};
