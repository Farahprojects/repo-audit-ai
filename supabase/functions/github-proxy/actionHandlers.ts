
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import { ComplexityAnalyzer } from '../_shared/github/ComplexityAnalyzer.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function handleStatsAction(client: GitHubAPIClient, owner: string, repo: string) {

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
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
        const primaryLang = languages.length > 0 ? languages[0]! : 'Unknown';
        const totalBytes = Object.values(langData as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        const primaryBytes = (langData as Record<string, number>)[primaryLang] || 0;
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

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
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

    try {
        // 1. Check if the owner exists (deterministic check)
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
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
        const repoRes = await client.fetchRepo(owner, repo);
        const repoData = await repoRes.json();

        // 3. Fetch languages
        const langRes = await client.fetchLanguages(owner, repo);
        const langData = await langRes.json();

        // 4. Build stats object
        const languages = Object.keys(langData);
        const primaryLang = languages.length > 0 ? languages[0]! : 'Unknown';
        const totalBytes = Object.values(langData as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        const primaryBytes = (langData as Record<string, number>)[primaryLang] || 0;
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
        const treeRes = await client.fetchTree(owner, repo, defaultBranch);
        const treeData = await treeRes.json();

        // 6. Generate fingerprint
        const fingerprint = await ComplexityAnalyzer.generateFingerprint(
            treeData.tree,
            langData,
            repoData,
            owner,
            repo,
            defaultBranch,
            client.getHeaders()
        );

        // 7. Create filtered file map and grouped summaries
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

        // Create semantic file groupings for better LLM understanding
        const fileGroups: Record<string, { count: number; examples: string[]; totalSize: number }> = {};

        function categorizeFile(path: string, size: number) {
            const lowerPath = path.toLowerCase();

            // SQL and Database files
            if (lowerPath.includes('migration') || lowerPath.includes('schema') || path.endsWith('.sql') || lowerPath.includes('supabase/migrations/')) {
                if (!fileGroups.sql) fileGroups.sql = { count: 0, examples: [], totalSize: 0 };
                fileGroups.sql.count++;
                fileGroups.sql.totalSize += size;
                if (fileGroups.sql.examples.length < 3) fileGroups.sql.examples.push(path);
            }
            // React/Vue components
            else if (path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.vue') || path.endsWith('.svelte')) {
                if (!fileGroups.components) fileGroups.components = { count: 0, examples: [], totalSize: 0 };
                fileGroups.components.count++;
                fileGroups.components.totalSize += size;
                if (fileGroups.components.examples.length < 3) fileGroups.components.examples.push(path);
            }
            // API routes
            else if (lowerPath.includes('api/') || lowerPath.includes('routes/') || lowerPath.includes('controllers/')) {
                if (!fileGroups.api) fileGroups.api = { count: 0, examples: [], totalSize: 0 };
                fileGroups.api.count++;
                fileGroups.api.totalSize += size;
                if (fileGroups.api.examples.length < 3) fileGroups.api.examples.push(path);
            }
            // Tests
            else if (lowerPath.includes('test') || lowerPath.includes('spec') || lowerPath.includes('__tests__')) {
                if (!fileGroups.tests) fileGroups.tests = { count: 0, examples: [], totalSize: 0 };
                fileGroups.tests.count++;
                fileGroups.tests.totalSize += size;
                if (fileGroups.tests.examples.length < 3) fileGroups.tests.examples.push(path);
            }
            // Configuration files
            else if (path.endsWith('package.json') || path.endsWith('tsconfig.json') || path.endsWith('.config.js') ||
                     path.endsWith('.config.ts') || path.includes('config.') || path.endsWith('.env')) {
                if (!fileGroups.config) fileGroups.config = { count: 0, examples: [], totalSize: 0 };
                fileGroups.config.count++;
                fileGroups.config.totalSize += size;
                if (fileGroups.config.examples.length < 3) fileGroups.config.examples.push(path);
            }
            // Documentation
            else if (path.endsWith('.md') || path.endsWith('.txt')) {
                if (!fileGroups.docs) fileGroups.docs = { count: 0, examples: [], totalSize: 0 };
                fileGroups.docs.count++;
                fileGroups.docs.totalSize += size;
                if (fileGroups.docs.examples.length < 3) fileGroups.docs.examples.push(path);
            }
            // TypeScript/JavaScript source
            else if (path.endsWith('.ts') || path.endsWith('.js')) {
                if (!fileGroups.source) fileGroups.source = { count: 0, examples: [], totalSize: 0 };
                fileGroups.source.count++;
                fileGroups.source.totalSize += size;
                if (fileGroups.source.examples.length < 3) fileGroups.source.examples.push(path);
            }
            // Other languages
            else if (path.endsWith('.py') || path.endsWith('.java') || path.endsWith('.go') || path.endsWith('.rs') || path.endsWith('.php') || path.endsWith('.rb')) {
                const lang = path.split('.').pop()!.toUpperCase();
                const key = `${lang.toLowerCase()}Files`;
                if (!fileGroups[key]) fileGroups[key] = { count: 0, examples: [], totalSize: 0 };
                fileGroups[key].count++;
                fileGroups[key].totalSize += size;
                if (fileGroups[key].examples.length < 3) fileGroups[key].examples.push(path);
            }
            // Catch-all for other files
            else {
                if (!fileGroups.other) fileGroups.other = { count: 0, examples: [], totalSize: 0 };
                fileGroups.other.count++;
                fileGroups.other.totalSize += size;
                if (fileGroups.other.examples.length < 3) fileGroups.other.examples.push(path);
            }
        }

        // Process all files into groups
        filteredTree.forEach((item: any) => {
            categorizeFile(item.path, item.size || 0);
        });

        // Convert to readable format for LLM
        const groupedSummary = Object.entries(fileGroups).map(([category, data]) => {
            const categoryName = category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            const sizeKB = Math.round(data.totalSize / 1024);
            const examples = data.examples.slice(0, 2).join(', ');
            return `${categoryName}: ${data.count} files (${sizeKB}KB) - ${examples}${data.examples.length > 2 ? '...' : ''}`;
        });

        // Keep individual file map for workers (they need specific paths)
        const fileMap = filteredTree.map((item: any) => ({
            path: item.path,
            size: item.size || 0,
            type: 'file'
        }));


        // 8. Return combined response
        return new Response(
            JSON.stringify({
                stats,
                fingerprint,
                fileMap,
                fileGroups: groupedSummary
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return handleError(error, owner, repo);
    }
}


export async function handleContentAction(client: GitHubAPIClient, owner: string, repo: string, filePath: string, branch?: string) {

    try {
        // First, check if the owner exists
        const ownerExists = await checkOwnerExists(client, owner);
        if (!ownerExists) {
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
    const statusCode = statusMatch ? parseInt(statusMatch[1]!) : null;

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
