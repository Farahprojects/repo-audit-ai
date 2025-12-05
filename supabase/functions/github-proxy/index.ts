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
    const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not configured');
    }

    const { owner, repo, branch = 'main', filePath } = await req.json();

    if (!owner || !repo) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: owner and repo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SCAI'
    };

    // If filePath is provided, fetch single file content
    if (filePath) {
      console.log(`Fetching file: ${owner}/${repo}/${filePath}`);
      
      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        { headers }
      );

      if (!fileResponse.ok) {
        const errorText = await fileResponse.text();
        console.error('GitHub file fetch error:', fileResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: `Failed to fetch file: ${fileResponse.status}` }),
          { status: fileResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Fetch repository tree
    console.log(`Fetching tree for: ${owner}/${repo}@${branch}`);
    
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );

    if (!treeResponse.ok) {
      const errorText = await treeResponse.text();
      console.error('GitHub tree fetch error:', treeResponse.status, errorText);
      
      // Check rate limit
      const remaining = treeResponse.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        return new Response(
          JSON.stringify({ error: 'GitHub API rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Failed to fetch repository: ${treeResponse.status}` }),
        { status: treeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const treeData = await treeResponse.json();
    
    // Filter to code files only (exclude binaries, images, etc.)
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb', '.php', '.vue', '.svelte', '.css', '.scss', '.html', '.json', '.yaml', '.yml', '.md', '.txt', '.sql', '.sh', '.env.example'];
    const excludePatterns = ['node_modules/', 'dist/', 'build/', '.git/', 'vendor/', '__pycache__/', '.next/', 'coverage/'];

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
        truncated: treeData.truncated 
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
