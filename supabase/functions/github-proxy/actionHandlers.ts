
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import { ComplexityAnalyzer } from '../_shared/github/ComplexityAnalyzer.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleStatsAction(client: GitHubAPIClient, owner: string, repo: string) {
    console.log(`🔍 [github-proxy] Fetching stats for: ${owner}/${repo}`);

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
            console.log(`❌ [github-proxy] Owner ${owner} does not exist`);
            return new Response(
                JSON.stringify({
                    error: 'Repository owner does not exist. Please check the URL spelling.',
                    errorCode: 'OWNER_NOT_FOUND',
                    requiresAuth: false,
                    isDefinitelyMissing: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Owner exists, now try to fetch repo
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();

        // If we get here, repo exists and is public
        const langRes = await client.fetchLanguages(owner, repo);
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

        const sizeInBytes = repoData.size * 1024;
        const sizeDisplay = sizeInBytes > (1024 * 1024 * 1024)
            ? `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
            : `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;

        const fileCount = Math.round(repoData.size / 5);

        return new Response(
            JSON.stringify({
                files: fileCount,
                tokens: tokenDisplay,
                size: sizeDisplay,
                language: primaryLang,
                languagePercent,
                defaultBranch: repoData.default_branch,
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
                pushedAt: repoData.pushed_at
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return handleError(error, owner, repo);
    }
}

export async function handleFingerprintAction(client: GitHubAPIClient, owner: string, repo: string, branch?: string) {
    console.log(`🔍 [github-proxy] Generating fingerprint for: ${owner}/${repo}`);

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
            console.log(`❌ [github-proxy] Owner ${owner} does not exist`);
            return new Response(
                JSON.stringify({
                    error: 'Repository owner does not exist. Please check the URL spelling.',
                    errorCode: 'OWNER_NOT_FOUND',
                    requiresAuth: false,
                    isDefinitelyMissing: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Owner exists, now try to fetch repo
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();

        // If we get here, repo exists and is accessible
        const langRes = await client.fetchLanguages(owner, repo);
        const langData = await langRes.json();

        const defaultBranch = branch || repoData.default_branch || 'main';
        const treeRes = await client.fetchTree(owner, repo, defaultBranch);
        const treeData = await treeRes.json();

        const fingerprint = await ComplexityAnalyzer.generateFingerprint(
            treeData.tree,
            langData,
            repoData,
            owner,
            repo,
            defaultBranch,
            client.getHeaders()
        );

        return new Response(
            JSON.stringify(fingerprint),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return handleError(error, owner, repo);
    }
}

/**
 * UNIFIED PREFLIGHT ACTION
 * Combines stats + fingerprint into a single response.
 * This is the single source of truth for repo access control.
 * 
 * Public repo → { stats: {...}, fingerprint: {...} }
 * Private repo → { errorCode: 'PRIVATE_REPO', requiresAuth: true }
 * Owner not found → { errorCode: 'OWNER_NOT_FOUND', requiresAuth: false }
 */
export async function handlePreflightAction(client: GitHubAPIClient, owner: string, repo: string, branch?: string) {
    console.log(`🚀 [github-proxy] PREFLIGHT for: ${owner}/${repo}`);

    try {
        // 1. Check if the owner exists (deterministic check)
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
            console.log(`❌ [github-proxy] Owner ${owner} does not exist`);
            return new Response(
                JSON.stringify({
                    error: 'Repository owner does not exist. Please check the URL spelling.',
                    errorCode: 'OWNER_NOT_FOUND',
                    requiresAuth: false,
                    isDefinitelyMissing: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Fetch repo data (access check happens here)
        // If private without auth, this will throw → handleError catches it
        console.log(`📊 [github-proxy] Fetching repo data (access check)...`);
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();
        console.log(`✅ [github-proxy] Repo is accessible`);

        // 3. Fetch languages
        console.log(`🔍 [github-proxy] Fetching languages...`);
        const langRes = await client.fetchLanguages(owner, repo);
        const langData = await langRes.json();

        // 4. Build stats object
        const languages = Object.keys(langData);
        const primaryLang = languages.length > 0 ? languages[0] : 'Unknown';
        const totalBytes = Object.values(langData).reduce((a: number, b: number) => a + b, 0) as number;
        const primaryBytes = (langData[primaryLang] as number) || 0;
        const languagePercent = totalBytes > 0 ? Math.round((primaryBytes / totalBytes) * 100) : 0;

        const estTokens = Math.round((repoData.size * 1024) / 4);
        const tokenDisplay = estTokens > 1000000
            ? `${(estTokens / 1000000).toFixed(1)}M`
            : `${(estTokens / 1000).toFixed(1)}k`;

        const sizeInBytes = repoData.size * 1024;
        const sizeDisplay = sizeInBytes > (1024 * 1024 * 1024)
            ? `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
            : `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;

        const fileCount = Math.round(repoData.size / 5);

        const stats = {
            files: fileCount,
            tokens: tokenDisplay,
            size: sizeDisplay,
            language: primaryLang,
            languagePercent,
            defaultBranch: repoData.default_branch,
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
            pushedAt: repoData.pushed_at
        };

        // 5. Fetch tree for fingerprint and file map
        const defaultBranch = branch || repoData.default_branch || 'main';
        console.log(`🌳 [github-proxy] Fetching tree for fingerprint and file map...`);
        const treeRes = await client.fetchTree(owner, repo, defaultBranch);
        const treeData = await treeRes.json();

        // 6. Generate fingerprint
        console.log(`🔐 [github-proxy] Generating complexity fingerprint...`);
        const fingerprint = await ComplexityAnalyzer.generateFingerprint(
            treeData.tree,
            langData,
            repoData,
            owner,
            repo,
            defaultBranch,
            client.getHeaders()
        );

        // 7. Create filtered file map (same logic as handleTreeAction)
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

        // Only include path, size, and type - NO file content or GitHub API URLs
        const fileMap = filteredTree.map((item: any) => ({
            path: item.path,
            size: item.size || 0,
            type: 'file'
        }));

        console.log(`✅ [github-proxy] PREFLIGHT SUCCESS - returning stats + fingerprint + ${fileMap.length} files`);

        // 8. Return combined response
        return new Response(
            JSON.stringify({
                stats,
                fingerprint,
                fileMap
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.log(`❌ [github-proxy] PREFLIGHT ERROR - handling...`);
        return handleError(error, owner, repo);
    }
}


export async function handleContentAction(client: GitHubAPIClient, owner: string, repo: string, filePath: string, branch?: string) {
    console.log(`Fetching file: ${owner}/${repo}/${filePath}`);

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
            console.log(`❌ [github-proxy] Owner ${owner} does not exist`);
            return new Response(
                JSON.stringify({
                    error: 'Repository owner does not exist. Please check the URL spelling.',
                    errorCode: 'OWNER_NOT_FOUND',
                    requiresAuth: false,
                    isDefinitelyMissing: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const defaultBranch = branch || 'main';
        const fileRes = await client.fetchFile(owner, repo, filePath, defaultBranch);
        const fileData = await fileRes.json();

        let content = '';
        if (fileData.content) {
            content = atob(fileData.content.replace(/\n/g, ''));
        }

        return new Response(
            JSON.stringify({ content, path: fileData.path, size: fileData.size }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return handleError(error, owner, repo);
    }
}

export async function handleTreeAction(client: GitHubAPIClient, owner: string, repo: string, branch?: string) {
    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
            console.log(`❌ [github-proxy] Owner ${owner} does not exist`);
            return new Response(
                JSON.stringify({
                    error: 'Repository owner does not exist. Please check the URL spelling.',
                    errorCode: 'OWNER_NOT_FOUND',
                    requiresAuth: false,
                    isDefinitelyMissing: true
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();
        const defaultBranch = branch || repoData.default_branch || 'main';

        console.log(`Fetching tree for: ${owner}/${repo}@${defaultBranch}`);

        const treeRes = await client.fetchTree(owner, repo, defaultBranch);
        const treeData = await treeRes.json();

        // Filter and tech stack detection logic (simplified reuse)
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

        const techStack = detectTechStack(treeData.tree);

        return new Response(
            JSON.stringify({
                tree: filteredTree,
                totalFiles: treeData.tree.length,
                codeFiles: filteredTree.length,
                truncated: treeData.truncated,
                defaultBranch,
                techStack
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return handleError(error, owner, repo);
    }
}

function detectTechStack(tree: any[]) {
    return {
        react: tree.some((item: any) => item.path.includes('package.json') || item.path.includes('.jsx') || item.path.includes('.tsx')),
        vue: tree.some((item: any) => item.path.includes('.vue') || item.path.includes('vue.config.js')),
        angular: tree.some((item: any) => item.path.includes('angular.json') || item.path.includes('.component.ts')),
        svelte: tree.some((item: any) => item.path.includes('.svelte')),
        nextjs: tree.some((item: any) => item.path.includes('next.config.') || item.path.includes('.next/')),
        nuxt: tree.some((item: any) => item.path.includes('nuxt.config.') || item.path.includes('.nuxt/')),
        python: tree.some((item: any) => item.path.includes('requirements.txt') || item.path.includes('Pipfile') || item.path.includes('pyproject.toml')),
        node: tree.some((item: any) => item.path.includes('package.json')),
        docker: tree.some((item: any) => item.path.includes('Dockerfile') || item.path.includes('docker-compose')),
        typescript: tree.some((item: any) => item.path.includes('tsconfig.json')),
        rust: tree.some((item: any) => item.path.includes('Cargo.toml')),
        go: tree.some((item: any) => item.path.includes('go.mod')),
        hasTests: tree.some((item: any) => item.path.includes('test') || item.path.includes('spec') || item.path.includes('__tests__')),
        hasReadme: tree.some((item: any) => item.path.toLowerCase().includes('readme')),
        hasLicense: tree.some((item: any) => item.path.toLowerCase().includes('license') || item.path.toLowerCase().includes('licence')),
        hasContributing: tree.some((item: any) => item.path.toLowerCase().includes('contributing')),
    };
}

async function checkOwnerExists(client: GitHubAPIClient, owner: string): Promise<boolean> {
    try {
        // Try user endpoint first
        await client.fetchUser(owner);
        return true;
    } catch (userError) {
        try {
            // If user endpoint fails, try org endpoint
            await client.fetchOrg(owner);
            return true;
        } catch (orgError) {
            // Both user and org endpoints failed - owner doesn't exist
            return false;
        }
    }
}

function handleError(error: any, owner?: string, repo?: string) {
    console.error('GitHub Proxy Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Parse HTTP status code from error message
    const statusMatch = message.match(/(\d{3})/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

    console.log('[handleError] Parsing error:', { message, statusCode, owner, repo });

    // Rate limit check
    if (message.includes('403') && message.includes('rate limit')) {
        return new Response(
            JSON.stringify({
                error: 'GitHub API rate limit exceeded. Please try again later.',
                errorCode: 'RATE_LIMIT',
                requiresAuth: false,
                isDefinitelyMissing: false
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // If we have owner/repo context and status is 404, we can be more specific
    if (owner && repo && statusCode === 404) {
        console.log(`[handleError] 404 for ${owner}/${repo} - this is a private repo (owner was already validated)`);
        return new Response(
            JSON.stringify({
                error: `Repository "${owner}/${repo}" exists but is private. Connect your GitHub account to access private repositories.`,
                errorCode: 'PRIVATE_REPO',
                requiresAuth: true,
                isDefinitelyMissing: false
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Handle other error types
    let errorCode = 'UNKNOWN';
    let requiresAuth = false;
    let isDefinitelyMissing = false;
    let errorMessage = message;

    if (statusCode === 404 && !owner) {
        // 404 without owner context - could be anything
        errorCode = 'GITHUB_404';
        errorMessage = 'Repository not found. Please check the URL spelling or connect your GitHub account for private repositories.';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode === 401) {
        errorCode = 'GITHUB_401';
        errorMessage = 'Authentication required. Please connect your GitHub account.';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode === 403) {
        errorCode = 'GITHUB_403';
        errorMessage = 'Access forbidden. This might be a private repository or you may have exceeded your API limits.';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode) {
        errorCode = `GITHUB_${statusCode}`;
        errorMessage = `GitHub API error: ${message}`;
    }

    // Always return 200 OK with structured error data
    return new Response(
        JSON.stringify({
            error: errorMessage,
            errorCode,
            requiresAuth,
            isDefinitelyMissing
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}
