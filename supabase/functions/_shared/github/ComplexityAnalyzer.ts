
export class ComplexityAnalyzer {
    static async generateFingerprint(
        tree: any[],
        langData: any,
        repoData: any,
        owner: string,
        repo: string,
        defaultBranch: string,
        headers?: Record<string, string>
    ) {
        // Basic metrics
        const file_count = tree.filter(item => item.type === 'blob').length;
        const total_size_kb = repoData.size;

        // Calculate token estimate (rough approximation)
        const token_estimate = Math.round((repoData.size * 1024) / 4); // Assume ~4 chars per token

        // Language analysis
        const languages = Object.keys(langData);
        const primary_language = languages.length > 0 ? languages[0] : 'Unknown';
        const totalBytes = (Object.values(langData) as number[]).reduce((a: number, b: number) => a + b, 0);
        const language_mix: Record<string, number> = {};

        languages.forEach(lang => {
            const bytes = langData[lang] as number;
            language_mix[lang.toLowerCase()] = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
        });

        // File type categorization
        let sql_files = 0;
        let config_files = 0;
        let frontend_files = 0;
        let backend_files = 0;
        let test_files = 0;

        // Detection flags
        let has_supabase = false;
        let has_docker = false;
        let has_env_files = false;
        let has_tests = false;
        let is_monorepo = false;

        // API endpoints estimation
        let api_endpoints_estimated = 0;

        // Analyze each file in the tree
        for (const item of tree) {
            if (item.type !== 'blob') continue;

            const path = item.path.toLowerCase();
            const fileName = path.split('/').pop() || '';

            // SQL files
            if (fileName.endsWith('.sql') || path.includes('/migrations/') || path.includes('/sql/')) {
                sql_files++;
            }

            // Config files
            if (['.json', '.yaml', '.yml', '.toml', '.env', '.env.example', '.env.local'].some(ext => fileName.endsWith(ext)) ||
                ['config', 'settings', 'conf'].some(keyword => fileName.includes(keyword))) {
                config_files++;
            }

            // Frontend files
            if (['.tsx', '.jsx', '.vue', '.svelte', '.html', '.css', '.scss'].some(ext => fileName.endsWith(ext)) ||
                path.includes('/components/') || path.includes('/pages/') || path.includes('/src/') && (fileName.endsWith('.ts') || fileName.endsWith('.js'))) {
                frontend_files++;
            }

            // Backend files
            if (path.includes('/server/') || path.includes('/api/') || path.includes('/routes/') ||
                path.includes('/controllers/') || path.includes('/services/') ||
                (['.py', '.go', '.rs', '.java', '.php', '.rb'].some(ext => fileName.endsWith(ext)))) {
                backend_files++;
            }

            // Test files
            if (path.includes('/test') || path.includes('/spec') || path.includes('__tests__') ||
                fileName.includes('test') || fileName.includes('spec')) {
                test_files++;
                has_tests = true;
            }

            // Detection flags
            if (path.includes('supabase') || fileName.includes('supabase')) {
                has_supabase = true;
            }

            if (fileName.includes('dockerfile') || fileName.includes('docker-compose') || path.includes('/docker/')) {
                has_docker = true;
            }

            if (fileName.startsWith('.env') || path.includes('/env/')) {
                has_env_files = true;
            }

            if (path.includes('/packages/') || path.includes('/apps/') || fileName === 'pnpm-workspace.yaml' || fileName === 'lerna.json') {
                is_monorepo = true;
            }

            // API endpoints estimation
            if (path.includes('/api/') || path.includes('/routes/') || path.includes('/controllers/')) {
                // Rough estimate: assume each API-related file has ~5 endpoints on average
                api_endpoints_estimated += 5;
            }
        }

        // Try to get dependency count from package.json
        let dependency_count = 0;
        if (headers) {
            try {
                const packageJsonResponse = await fetch(
                    `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${defaultBranch}`,
                    { headers }
                );

                if (packageJsonResponse.ok) {
                    const packageData = await packageJsonResponse.json();
                    const content = JSON.parse(atob(packageData.content.replace(/\n/g, '')));

                    const deps = content.dependencies ? Object.keys(content.dependencies).length : 0;
                    const devDeps = content.devDependencies ? Object.keys(content.devDependencies).length : 0;
                    dependency_count = deps + devDeps;
                }
            } catch (error) {
                console.log('Could not fetch package.json for dependency count');
            }
        }

        return {
            // Basic metrics
            file_count,
            total_size_kb,
            token_estimate,

            // Language breakdown
            language_mix,
            primary_language,

            // File type counts
            sql_files,
            config_files,
            frontend_files,
            backend_files,
            test_files,

            // Detection flags
            has_supabase,
            has_docker,
            has_env_files,
            has_tests,
            is_monorepo,

            // Dependency info
            dependency_count,

            // API surface hints
            api_endpoints_estimated,
        };
    }
}
