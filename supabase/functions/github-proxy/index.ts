// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { owner, repo, branch, filePath, action, userToken } = await req.json();

    if (!owner || !repo) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: owner and repo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prefer user's OAuth token for private repos, fallback to server token for public
    const GITHUB_TOKEN = userToken || Deno.env.get('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) {
      throw new Error('No GitHub token available. User token or GITHUB_TOKEN required.');
    }

    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SCAI'
    };

    // =========================================================================
    // ACTION: stats - Fetch repository metadata and stats
    // =========================================================================
    if (action === 'stats') {
      console.log(`Fetching stats for: ${owner}/${repo}`);

      const repoRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
      );

      if (!repoRes.ok) {
        const remaining = repoRes.headers.get('X-RateLimit-Remaining');
        if (remaining === '0') {
          return new Response(
            JSON.stringify({ error: 'GitHub API rate limit exceeded' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: `Repository not found: ${repoRes.status}` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const repoData = await repoRes.json();

      // Fetch languages
      const langRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/languages`,
        { headers }
      );
      const langData = await langRes.json();

      const languages = Object.keys(langData);
      const primaryLang = languages.length > 0 ? languages[0] : 'Unknown';
      const totalBytes = Object.values(langData).reduce((a: number, b: number) => a + b, 0) as number;
      const primaryBytes = (langData[primaryLang] as number) || 0;
      const languagePercent = totalBytes > 0 ? Math.round((primaryBytes / totalBytes) * 100) : 0;

      const estTokens = Math.round((repoData.size * 1024) / 4);
      const tokenDisplay = estTokens > 1000000
        ? `${(estTokens / 1000000).toFixed(1)}M`
        : `${(estTokens / 1000).toFixed(1)}k`;

      const fileCount = Math.round(repoData.size / 5);

      return new Response(
        JSON.stringify({
          files: fileCount,
          tokens: tokenDisplay,
          language: primaryLang,
          languagePercent,
          defaultBranch: repoData.default_branch
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION: Fetch single file content
    // =========================================================================
    if (filePath) {
      const defaultBranch = branch || 'main';
      console.log(`Fetching file: ${owner}/${repo}/${filePath}`);

      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${defaultBranch}`,
        { headers }
      );

      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        console.error('GitHub file fetch error:', fileResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Failed to fetch file: ${fileResponse.status}` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fileData = await fileResponse.json();

      // Decode base64 content
      let content = '';
      if (fileData.content) {
        content = atob(fileData.content.replace(/\n/g, ''));
      }

      return new Response(
        JSON.stringify({ content, path: fileData.path, size: fileData.size }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // DEFAULT: Fetch repository tree
    // =========================================================================
    // First get default branch
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );

    if (!repoRes.ok) {
      const remaining = repoRes.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        return new Response(
          JSON.stringify({ error: 'GitHub API rate limit exceeded' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Repository not found: ${repoRes.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const repoData = await repoRes.json();
    const defaultBranch = branch || repoData.default_branch || 'main';

    console.log(`Fetching tree for: ${owner}/${repo}@${defaultBranch}`);

    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      { headers }
    );

    if (!treeResponse.ok) {
      const errorText = await treeResponse.text();
      console.error('GitHub tree fetch error:', treeResponse.status, errorText);

      const remaining = treeResponse.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        return new Response(
          JSON.stringify({ error: 'GitHub API rate limit exceeded. Please try again later.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Failed to fetch repository: ${treeResponse.status}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const treeData = await treeResponse.json();

    // Filter to code files only (exclude binaries, images, etc.)
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb', '.php', '.vue', '.svelte', '.css', '.scss', '.html', '.json', '.yaml', '.yml', '.md', '.txt', '.sql', '.sh', '.env.example'];
    const excludePatterns = ['node_modules/', 'dist/', 'build/', '.git/', 'vendor/', '__pycache__/', '.next/', 'coverage/', '.docz/', 'storybook-static/'];

    const filteredTree = treeData.tree.filter((item: any) => {
      if (item.type !== 'blob') return false;

      // Exclude common non-code directories
      if (excludePatterns.some(pattern => item.path.includes(pattern))) return false;

      // Include only code files
      const ext = '.' + item.path.split('.').pop()?.toLowerCase();
      return codeExtensions.includes(ext) || item.path.includes('Dockerfile') || item.path.includes('Makefile');
    });

    console.log(`Found ${filteredTree.length} code files out of ${treeData.tree.length} total`);

    return new Response(
      JSON.stringify({
        tree: filteredTree,
        totalFiles: treeData.tree.length,
        codeFiles: filteredTree.length,
        truncated: treeData.truncated,
        defaultBranch
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('GitHub proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
