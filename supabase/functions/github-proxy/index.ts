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

    // For private repos, require user token (will be validated server-side)
    let GITHUB_TOKEN = userToken;

    // If no user token provided, try to get it from the user's GitHub account
    if (!GITHUB_TOKEN && owner) {
      try {
        // Get auth token from request to identify user
        const authHeader = req.headers.get('authorization');
        if (authHeader) {
          const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

          // Decode JWT to get user_id
          let userId: string | null = null;
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              const paddedBase64 = base64 + '='.repeat((4 - base64.length % 4) % 4);
              const decoded = atob(paddedBase64);
              const payload = JSON.parse(decoded);
              userId = payload.sub;
            }
          } catch (e) {
            console.error('Failed to decode JWT for user lookup');
          }

          if (userId) {
            // Import Supabase client
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
            const supabase = createClient(
              Deno.env.get('SUPABASE_URL')!,
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );

            // Get user's GitHub account
            const { data: githubAccount, error } = await supabase
              .from('github_accounts')
              .select('access_token_encrypted')
              .eq('user_id', userId)
              .single();

            if (!error && githubAccount) {
              // Decrypt token server-side
              const encryptedToken = githubAccount.access_token_encrypted;
              const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

              // Simple decryption logic (same as in decrypt-github-token function)
              try {
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();
                const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
                const salt = combined.slice(0, 16);
                const iv = combined.slice(16, 28);
                const encrypted = combined.slice(28);

                const keyMaterial = await crypto.subtle.importKey(
                  'raw',
                  encoder.encode(secret),
                  'PBKDF2',
                  false,
                  ['deriveBits', 'deriveKey']
                );

                const key = await crypto.subtle.deriveKey(
                  {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                  },
                  keyMaterial,
                  { name: 'AES-GCM', length: 256 },
                  false,
                  ['decrypt']
                );

                const decrypted = await crypto.subtle.decrypt(
                  { name: 'AES-GCM', iv: iv },
                  key,
                  encrypted
                );

                GITHUB_TOKEN = decoder.decode(decrypted);
              } catch (decryptError) {
                console.error('Failed to decrypt GitHub token:', decryptError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error retrieving user GitHub token:', error);
      }
    }

    // Prepare headers - only include Authorization if we have a token
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SCAI'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      console.log('🔑 [github-proxy] Using authenticated request with user token');
    } else {
      console.log('🌐 [github-proxy] Making unauthenticated request (public repo access)');
    }

    // =========================================================================
    // ACTION: stats - Fetch repository metadata and stats
    // =========================================================================
    if (action === 'stats') {
      console.log(`🔍 [github-proxy] Fetching stats for: ${owner}/${repo}`);
      console.log(`🔍 [github-proxy] Using token:`, !!GITHUB_TOKEN);

      const repoRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
      );

      console.log(`🔍 [github-proxy] GitHub API response status:`, repoRes.status);
      console.log(`🔍 [github-proxy] GitHub API response headers:`, Object.fromEntries(repoRes.headers.entries()));

      if (!repoRes.ok) {
        const remaining = repoRes.headers.get('X-RateLimit-Remaining');
        console.log(`🔍 [github-proxy] Rate limit remaining:`, remaining);
        console.log(`🔍 [github-proxy] Response status:`, repoRes.status);
        console.log(`🔍 [github-proxy] Response headers:`, Object.fromEntries(repoRes.headers.entries()));

        if (remaining === '0') {
          console.log(`⏱️ [github-proxy] Rate limit exceeded`);
          return new Response(
            JSON.stringify({ error: 'GitHub API rate limit exceeded' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the response body for better error details
        const errorText = await repoRes.text();
        console.log(`❌ [github-proxy] GitHub API error response body:`, errorText);

        // Try to parse as JSON for more details
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = errorJson.message || errorText;
          console.log(`❌ [github-proxy] Parsed error details:`, errorJson);
        } catch (e) {
          // Not JSON, use raw text
        }

        console.log(`❌ [github-proxy] Final status analysis:`, {
          status: repoRes.status,
          hasAuth: !!GITHUB_TOKEN,
          errorDetails
        });

        return new Response(
          JSON.stringify({ error: `Repository not found: ${repoRes.status}` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const repoData = await repoRes.json();
      console.log(`✅ [github-proxy] Successfully fetched repo data:`, {
        name: repoData.name,
        private: repoData.private,
        size: repoData.size,
        language: repoData.language,
        default_branch: repoData.default_branch
      });

      // Fetch languages
      console.log(`🔍 [github-proxy] Fetching languages...`);
      const langRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/languages`,
        { headers }
      );
      const langData = await langRes.json();
      console.log(`✅ [github-proxy] Languages data:`, langData);

      const languages = Object.keys(langData);
      const primaryLang = languages.length > 0 ? languages[0] : 'Unknown';
      const totalBytes = Object.values(langData).reduce((a: number, b: number) => a + b, 0) as number;
      const primaryBytes = (langData[primaryLang] as number) || 0;
      const languagePercent = totalBytes > 0 ? Math.round((primaryBytes / totalBytes) * 100) : 0;

      const estTokens = Math.round((repoData.size * 1024) / 4);
      const tokenDisplay = estTokens > 1000000
        ? `${(estTokens / 1000000).toFixed(1)}M`
        : `${(estTokens / 1000).toFixed(1)}k`;

      // Calculate repository size in human-readable format
      const sizeInBytes = repoData.size * 1024; // GitHub size is in KB
      const sizeDisplay = sizeInBytes > (1024 * 1024 * 1024)
        ? `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
        : `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;

      console.log(`📏 [github-proxy] Size calculation: ${repoData.size}KB → ${sizeInBytes} bytes → ${sizeDisplay}`);

      const fileCount = Math.round(repoData.size / 5);

      console.log(`📊 [github-proxy] Calculated stats:`, {
        repoSizeKB: repoData.size,
        sizeDisplay,
        fileCount,
        primaryLang,
        languagePercent,
        estTokens,
        tokenDisplay,
        totalBytes
      });

      return new Response(
        JSON.stringify({
          files: fileCount,
          tokens: tokenDisplay,
          size: sizeDisplay,
          language: primaryLang,
          languagePercent,
          defaultBranch: repoData.default_branch,
          // Additional valuable metadata
          stars: repoData.stargazers_count || 0,
          forks: repoData.forks_count || 0,
          issues: repoData.open_issues_count || 0,
          watchers: repoData.watchers_count || 0,
          isPrivate: repoData.private || false,
          hasWiki: repoData.has_wiki || false,
          hasPages: repoData.has_pages || false,
          archived: repoData.archived || false,
          disabled: repoData.disabled || false,
          createdAt: repoData.created_at,
          updatedAt: repoData.updated_at,
          pushedAt: repoData.pushed_at,
          // Technology stack detection
          techStack
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

    // Detect technology stack from file paths
    const techStack = {
      react: treeData.tree.some((item: any) => item.path.includes('package.json') || item.path.includes('.jsx') || item.path.includes('.tsx')),
      vue: treeData.tree.some((item: any) => item.path.includes('.vue') || item.path.includes('vue.config.js')),
      angular: treeData.tree.some((item: any) => item.path.includes('angular.json') || item.path.includes('.component.ts')),
      svelte: treeData.tree.some((item: any) => item.path.includes('.svelte')),
      nextjs: treeData.tree.some((item: any) => item.path.includes('next.config.') || item.path.includes('.next/')),
      nuxt: treeData.tree.some((item: any) => item.path.includes('nuxt.config.') || item.path.includes('.nuxt/')),
      python: treeData.tree.some((item: any) => item.path.includes('requirements.txt') || item.path.includes('Pipfile') || item.path.includes('pyproject.toml')),
      node: treeData.tree.some((item: any) => item.path.includes('package.json')),
      docker: treeData.tree.some((item: any) => item.path.includes('Dockerfile') || item.path.includes('docker-compose')),
      typescript: treeData.tree.some((item: any) => item.path.includes('tsconfig.json')),
      rust: treeData.tree.some((item: any) => item.path.includes('Cargo.toml')),
      go: treeData.tree.some((item: any) => item.path.includes('go.mod')),
      hasTests: treeData.tree.some((item: any) => item.path.includes('test') || item.path.includes('spec') || item.path.includes('__tests__')),
      hasReadme: treeData.tree.some((item: any) => item.path.toLowerCase().includes('readme')),
      hasLicense: treeData.tree.some((item: any) => item.path.toLowerCase().includes('license') || item.path.toLowerCase().includes('licence')),
      hasContributing: treeData.tree.some((item: any) => item.path.toLowerCase().includes('contributing')),
    };

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
