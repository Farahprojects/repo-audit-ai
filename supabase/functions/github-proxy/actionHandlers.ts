
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import { ComplexityAnalyzer } from '../_shared/github/ComplexityAnalyzer.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleStatsAction(client: GitHubAPIClient, owner: string, repo: string) {
    console.log(`🔍 [github-proxy] Fetching stats for: ${owner}/${repo}`);

    try {
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();

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
        return handleError(error);
    }
}

export async function handleFingerprintAction(client: GitHubAPIClient, owner: string, repo: string, branch?: string) {
    console.log(`🔍 [github-proxy] Generating fingerprint for: ${owner}/${repo}`);

    try {
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();

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
        return handleError(error);
    }
}

export async function handleContentAction(client: GitHubAPIClient, owner: string, repo: string, filePath: string, branch?: string) {
    console.log(`Fetching file: ${owner}/${repo}/${filePath}`);
    const defaultBranch = branch || 'main';

    try {
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
        return handleError(error);
    }
}

export async function handleTreeAction(client: GitHubAPIClient, owner: string, repo: string, branch?: string) {
    try {
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
        return handleError(error);
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

function handleError(error: any) {
    console.error('GitHub Proxy Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Parse HTTP status code from error message
    const statusMatch = message.match(/(\d{3})/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

    console.log('[handleError] Parsing error:', { message, statusCode });

    // Rate limit check
    if (message.includes('403') && message.includes('rate limit')) {
        return new Response(
            JSON.stringify({ 
                error: 'GitHub API rate limit exceeded',
                errorCode: 'RATE_LIMIT',
                requiresAuth: false,
                isDefinitelyMissing: false
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Determine error type and structured response
    let errorCode = 'UNKNOWN';
    let requiresAuth = false;
    let isDefinitelyMissing = false;

    if (statusCode === 404) {
        // 404 could be private OR misspelled - can't know without auth
        errorCode = 'GITHUB_404';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode === 401) {
        errorCode = 'GITHUB_401';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode === 403) {
        errorCode = 'GITHUB_403';
        requiresAuth = true;
        isDefinitelyMissing = false;
    } else if (statusCode) {
        errorCode = `GITHUB_${statusCode}`;
    }

    // Always return 200 OK with structured error data
    return new Response(
        JSON.stringify({ 
            error: message,
            errorCode,
            requiresAuth,
            isDefinitelyMissing
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
}
