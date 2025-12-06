import { AuditStats } from '../types';
import { supabase } from '../src/integrations/supabase/client';

interface FileContent {
  path: string;
  content: string;
}

export const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch (e) {
    // Try parsing as owner/repo format
    const parts = url.split('/');
    if (parts.length === 2) return { owner: parts[0], repo: parts[1] };
  }
  return null;
};

/**
 * Fetch repository stats via Supabase github-proxy edge function
 */
export const fetchRepoStats = async (owner: string, repo: string): Promise<AuditStats> => {
  // Call github-proxy edge function
  const { data, error } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo, action: 'stats' }
  });

  if (error) {
    console.error('GitHub proxy error:', error);
    throw new Error(error.message || 'Failed to fetch repository');
  }

  if (data?.error) {
    if (data.error.includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded. Please try again later.');
    }
    if (data.error.includes('404')) {
      throw new Error('Repository not found or private.');
    }
    throw new Error(data.error);
  }

  return data as AuditStats;
};

/**
 * Fetch repository files via Supabase github-proxy edge function
 */
export const fetchRepoFiles = async (owner: string, repo: string): Promise<FileContent[]> => {
  // Step 1: Get file tree
  const { data: treeData, error: treeError } = await supabase.functions.invoke('github-proxy', {
    body: { owner, repo }
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
        body: { owner, repo, filePath: file.path }
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
