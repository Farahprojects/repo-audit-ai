import { AuditStats } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

// In production, this should be an endpoint to your backend (e.g., /api/github/fetch)
// to hide the token and handle rate limiting.
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || ''; 

interface FileContent {
  path: string;
  content: string;
}

const getHeaders = () => {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  return headers;
};

export const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch (e) {
    const parts = url.split('/');
    if (parts.length === 2) return { owner: parts[0], repo: parts[1] };
  }
  return null;
};

export const fetchRepoStats = async (owner: string, repo: string): Promise<AuditStats> => {
  const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers: getHeaders() });
  
  if (!repoRes.ok) {
    if (repoRes.status === 403) throw new Error("GitHub API Rate Limit Exceeded");
    if (repoRes.status === 404) throw new Error("Repository not found or private");
    throw new Error('Failed to fetch repository metadata');
  }
  
  const repoData = await repoRes.json();
  
  const langRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/languages`, { headers: getHeaders() });
  const langData = await langRes.json();
  
  const languages = Object.keys(langData);
  const primaryLang = languages.length > 0 ? languages[0] : 'Unknown';
  
  const totalBytes = Object.values(langData).reduce((a: any, b: any) => a + b, 0) as number;
  const primaryBytes = (langData[primaryLang] as number) || 0;
  const languagePercent = totalBytes > 0 ? Math.round((primaryBytes / totalBytes) * 100) : 0;

  const estTokens = Math.round((repoData.size * 1024) / 4); 
  const tokenDisplay = estTokens > 1000000 
    ? `${(estTokens / 1000000).toFixed(1)}M` 
    : `${(estTokens / 1000).toFixed(1)}k`;

  // Heuristic for files: size in KB / 5KB avg file size
  let fileCount = Math.round(repoData.size / 5); 

  return {
    files: fileCount,
    tokens: tokenDisplay,
    language: primaryLang,
    languagePercent
  };
};

export const fetchRepoFiles = async (owner: string, repo: string): Promise<FileContent[]> => {
  try {
    // 1. Get default branch
    const repoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers: getHeaders() });
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    // 2. Fetch Tree
    const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers: getHeaders() });
    const treeData = await treeRes.json();

    if (!treeData.tree) return [];

    // 3. Filter Strategy
    const allFiles = treeData.tree.filter((f: any) => f.type === 'blob');
    
    // Prioritize high-value config files
    const configFiles = allFiles.filter((f: any) => 
      f.path.endsWith('package.json') || 
      f.path.endsWith('requirements.txt') ||
      f.path.endsWith('Dockerfile') ||
      f.path.endsWith('docker-compose.yml')
    );

    // Prioritize source code
    const sourceFiles = allFiles.filter((f: any) => 
      (f.path.includes('src/') || f.path.includes('lib/') || f.path.includes('app/') || f.path.includes('components/')) &&
      (f.path.endsWith('.ts') || f.path.endsWith('.js') || f.path.endsWith('.py') || f.path.endsWith('.tsx') || f.path.endsWith('.jsx'))
    ).slice(0, 6); // Fetch 6 source files max to keep request latency low for demo

    const filesToFetch = [...configFiles, ...sourceFiles].slice(0, 8); // Cap at 8 total files

    const contents = await Promise.all(filesToFetch.map(async (file: any) => {
      const contentRes = await fetch(file.url, { headers: getHeaders() });
      const contentData = await contentRes.json();
      try {
        const decodedContent = atob(contentData.content.replace(/\n/g, ''));
        return {
          path: file.path,
          content: decodedContent
        };
      } catch (e) {
        return null;
      }
    }));

    return contents.filter(Boolean) as FileContent[];

  } catch (error) {
    console.error("Failed to fetch repo files", error);
    throw error;
  }
};
