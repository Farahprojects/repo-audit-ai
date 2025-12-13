import {
    FileAnnotation,
    AnnotationSummary,
    FileReference,
    AnnotatedFile,
    AnnotatedFileMap
} from './FileAnnotation.ts';

/**
 * FileAnnotationAnalyzer - Pure static analysis for observable file traits
 * 
 * NO LLM. NO content parsing. NO reasoning.
 * Only pattern matching on paths and metadata.
 */
export class FileAnnotationAnalyzer {

    // Entry point patterns
    private static readonly ENTRY_PATTERNS = [
        /^index\.[tj]sx?$/i,
        /^main\.[tj]sx?$/i,
        /^app\.[tj]sx?$/i,
        /^entry\.[tj]sx?$/i,
        /^server\.[tj]sx?$/i,
        /^handler\.[tj]sx?$/i,
    ];

    // Config file patterns
    private static readonly CONFIG_PATTERNS = [
        /\.config\.[tj]sx?$/i,
        /\.config\.(json|ya?ml|toml)$/i,
        /^tsconfig.*\.json$/i,
        /^package\.json$/i,
        /^\.env/i,
        /^next\.config/i,
        /^vite\.config/i,
        /^tailwind\.config/i,
        /^prettier/i,
        /^eslint/i,
        /^jest\.config/i,
        /^vitest\.config/i,
    ];

    // Test file patterns
    private static readonly TEST_PATTERNS = [
        /\.test\.[tj]sx?$/i,
        /\.spec\.[tj]sx?$/i,
        /__tests__\//i,
        /\/tests?\//i,
        /\/spec\//i,
    ];

    // Auth-related path patterns
    private static readonly AUTH_PATTERNS = [
        /\/auth\//i,
        /\/login/i,
        /\/logout/i,
        /\/session/i,
        /\/token/i,
        /\/credential/i,
        /\/oauth/i,
        /\/sso/i,
        /\/password/i,
        /\/signin/i,
        /\/signup/i,
        /auth\.[tj]sx?$/i,
    ];

    // Database-related path patterns
    private static readonly DB_PATTERNS = [
        /\/db\//i,
        /\/database\//i,
        /\/sql\//i,
        /\/prisma\//i,
        /\/drizzle\//i,
        /\/migrations?\//i,
        /\/schema/i,
        /\/models?\//i,
        /\/entities?\//i,
        /\.sql$/i,
        /supabase\//i,
    ];

    // API-related path patterns
    private static readonly API_PATTERNS = [
        /\/api\//i,
        /\/routes?\//i,
        /\/endpoints?\//i,
        /\/handlers?\//i,
        /\/controllers?\//i,
        /\/functions\//i,
        /\/graphql\//i,
        /\/trpc\//i,
    ];

    // Secrets-related path patterns
    private static readonly SECRETS_PATTERNS = [
        /\/secrets?\//i,
        /\/keys?\//i,
        /\/credentials?\//i,
        /^\.env/i,
        /\.pem$/i,
        /\.key$/i,
    ];

    // Build-time file patterns (processed at compile, not request)
    private static readonly BUILD_TIME_PATTERNS = [
        /\.config\./i,
        /^tailwind/i,
        /^vite/i,
        /^next\.config/i,
        /^webpack/i,
        /^babel/i,
        /^postcss/i,
    ];

    // Utility file patterns
    private static readonly UTILITY_PATTERNS = [
        /\/utils?\//i,
        /\/helpers?\//i,
        /\/lib\//i,
        /\/common\//i,
        /\/shared\//i,
    ];

    // Core/service file patterns
    private static readonly CORE_PATTERNS = [
        /\/services?\//i,
        /\/core\//i,
        /\/domain\//i,
        /\/business\//i,
        /\/features?\//i,
    ];

    /**
     * Annotate a single file based on its path and metadata
     */
    static annotate(path: string, size: number): FileAnnotation {
        const fileName = path.split('/').pop() || '';
        const depth = path.split('/').length - 1;

        // Check patterns
        const isEntryPoint = this.ENTRY_PATTERNS.some(p => p.test(fileName));
        const isConfig = this.CONFIG_PATTERNS.some(p => p.test(fileName)) ||
            this.CONFIG_PATTERNS.some(p => p.test(path));
        const isTest = this.TEST_PATTERNS.some(p => p.test(path));

        const touchesAuth = this.AUTH_PATTERNS.some(p => p.test(path));
        const touchesDatabase = this.DB_PATTERNS.some(p => p.test(path));
        const touchesApi = this.API_PATTERNS.some(p => p.test(path));
        const touchesSecrets = this.SECRETS_PATTERNS.some(p => p.test(path));
        const touchesEnv = /env/i.test(path) || /\.env/i.test(fileName);

        // Estimate execution context
        const isBuildTime = this.BUILD_TIME_PATTERNS.some(p => p.test(path));
        const executionContext: 'build' | 'request' | 'unknown' =
            isBuildTime ? 'build' :
                (touchesApi || isEntryPoint) ? 'request' : 'unknown';

        // Estimate fan-out (imports from many places)
        // Heuristic: utilities and shared files have high fan-out
        const isUtility = this.UTILITY_PATTERNS.some(p => p.test(path));
        const fanOutEstimate: 'low' | 'medium' | 'high' =
            isUtility ? 'high' :
                isConfig ? 'low' :
                    isTest ? 'low' :
                        (touchesApi || isEntryPoint) ? 'medium' : 'low';

        // Determine architectural layer
        const layer = this.determineLayer(path, {
            isEntryPoint, isConfig, isTest, touchesApi, touchesDatabase
        });

        return {
            depth,
            isEntryPoint,
            isConfig,
            isTest,
            touchesEnv,
            touchesAuth,
            touchesDatabase,
            touchesApi,
            touchesSecrets,
            fanOutEstimate,
            executionContext,
            layer,
        };
    }

    /**
     * Determine the architectural layer of a file
     */
    private static determineLayer(
        path: string,
        signals: {
            isEntryPoint: boolean;
            isConfig: boolean;
            isTest: boolean;
            touchesApi: boolean;
            touchesDatabase: boolean;
        }
    ): 'boundary' | 'core' | 'utility' | 'config' | 'test' | 'unknown' {
        // Priority order matters
        if (signals.isTest) return 'test';
        if (signals.isConfig) return 'config';
        if (signals.touchesApi || signals.isEntryPoint) return 'boundary';
        if (this.UTILITY_PATTERNS.some(p => p.test(path))) return 'utility';
        if (this.CORE_PATTERNS.some(p => p.test(path)) || signals.touchesDatabase) return 'core';
        return 'unknown';
    }

    /**
     * Generate aggregate summary from all annotated files
     */
    static summarize(files: AnnotatedFile[]): AnnotationSummary {
        const summary: AnnotationSummary = {
            totalFiles: files.length,
            byLayer: { boundary: 0, core: 0, utility: 0, config: 0, test: 0, unknown: 0 },
            byExecutionContext: { build: 0, request: 0, unknown: 0 },
            entryPoints: 0,
            touchesAuth: 0,
            touchesDatabase: 0,
            touchesSecrets: 0,
            touchesApi: 0,
            highFanOut: 0,
            avgDepth: 0,
            maxDepth: 0,
        };

        let totalDepth = 0;

        for (const file of files) {
            const a = file.annotations;

            summary.byLayer[a.layer]++;
            summary.byExecutionContext[a.executionContext]++;

            if (a.isEntryPoint) summary.entryPoints++;
            if (a.touchesAuth) summary.touchesAuth++;
            if (a.touchesDatabase) summary.touchesDatabase++;
            if (a.touchesSecrets) summary.touchesSecrets++;
            if (a.touchesApi) summary.touchesApi++;
            if (a.fanOutEstimate === 'high') summary.highFanOut++;

            totalDepth += a.depth;
            if (a.depth > summary.maxDepth) summary.maxDepth = a.depth;
        }

        summary.avgDepth = files.length > 0
            ? Math.round((totalDepth / files.length) * 10) / 10
            : 0;

        return summary;
    }

    /**
     * Create complete annotated file map from raw tree data
     * 
     * @param tree - GitHub tree data (path, size, type)
     * @param displayLimit - Max files to include in display section
     */
    static createAnnotatedFileMap(
        tree: Array<{ path: string; size?: number; type?: string }>,
        displayLimit = 100
    ): AnnotatedFileMap {
        // Filter to files only
        const files = tree.filter(item => item.type === 'blob' || !item.type);

        // Annotate all files
        const annotatedFiles: AnnotatedFile[] = files.map((file, index) => ({
            id: `f_${String(index).padStart(4, '0')}`,
            path: file.path,
            size: file.size || 0,
            type: 'file' as const,
            annotations: this.annotate(file.path, file.size || 0),
        }));

        // Create full file index
        const fileIndex: FileReference[] = annotatedFiles.map(f => ({
            id: f.id,
            path: f.path,
            size: f.size,
            layer: f.annotations.layer,
        }));

        // Generate summary
        const summary = this.summarize(annotatedFiles);

        // Select representative files for display
        const display = this.selectRepresentativeFiles(annotatedFiles, displayLimit);

        return { display, summary, fileIndex };
    }

    /**
     * Select representative files for brain context
     * Prioritizes high-signal files: boundaries, auth, database, secrets
     */
    private static selectRepresentativeFiles(
        files: AnnotatedFile[],
        limit: number
    ): AnnotatedFile[] {
        // Score each file by signal value
        const scored = files.map(f => ({
            file: f,
            score: this.calculateSignalScore(f),
        }));

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Take top N
        return scored.slice(0, limit).map(s => s.file);
    }

    /**
     * Calculate signal score for file prioritization
     * Higher score = more important for brain to see
     */
    private static calculateSignalScore(file: AnnotatedFile): number {
        const a = file.annotations;
        let score = 0;

        // Boundary files are highest priority (attack surface)
        if (a.layer === 'boundary') score += 50;
        if (a.isEntryPoint) score += 30;
        if (a.touchesApi) score += 25;

        // Security-sensitive files
        if (a.touchesSecrets) score += 40;
        if (a.touchesAuth) score += 35;

        // Data layer
        if (a.touchesDatabase) score += 30;

        // Core logic
        if (a.layer === 'core') score += 20;

        // High fan-out = widely imported = high impact
        if (a.fanOutEstimate === 'high') score += 15;

        // Request-time execution = runtime concerns
        if (a.executionContext === 'request') score += 10;

        // Penalties
        if (a.isTest) score -= 30;  // Tests are lower priority
        if (a.isConfig) score -= 10; // Config files are less interesting

        return score;
    }

    /**
     * Format annotation summary for brain prompt
     */
    static formatSummaryForPrompt(summary: AnnotationSummary): string {
        const lines: string[] = [
            `REPOSITORY SHAPE (${summary.totalFiles} files):`,
            '',
            'LAYER DISTRIBUTION:',
            `  - Boundary (API/entry): ${summary.byLayer.boundary} files`,
            `  - Core (services/domain): ${summary.byLayer.core} files`,
            `  - Utility (shared/helpers): ${summary.byLayer.utility} files`,
            `  - Config: ${summary.byLayer.config} files`,
            `  - Tests: ${summary.byLayer.test} files`,
            `  - Other: ${summary.byLayer.unknown} files`,
            '',
            'KEY SIGNALS:',
        ];

        if (summary.entryPoints > 0) {
            lines.push(`  - ${summary.entryPoints} entry points (index.*, main.*, app.*)`);
        }
        if (summary.touchesApi > 0) {
            lines.push(`  - ${summary.touchesApi} files in API layer`);
        }
        if (summary.touchesAuth > 0) {
            lines.push(`  - ${summary.touchesAuth} files touch auth/session/token`);
        }
        if (summary.touchesDatabase > 0) {
            lines.push(`  - ${summary.touchesDatabase} files touch database/ORM`);
        }
        if (summary.touchesSecrets > 0) {
            lines.push(`  - ${summary.touchesSecrets} files may handle secrets/keys`);
        }
        if (summary.highFanOut > 0) {
            lines.push(`  - ${summary.highFanOut} high fan-out utility files`);
        }

        lines.push('');
        lines.push('EXECUTION CONTEXT:');
        lines.push(`  - Request-time: ${summary.byExecutionContext.request} files`);
        lines.push(`  - Build-time: ${summary.byExecutionContext.build} files`);
        lines.push(`  - Unknown: ${summary.byExecutionContext.unknown} files`);

        lines.push('');
        lines.push(`DEPTH: avg=${summary.avgDepth}, max=${summary.maxDepth}`);

        return lines.join('\n');
    }

    /**
     * Format file list grouped by layer for brain prompt
     */
    static formatFilesByLayer(files: AnnotatedFile[]): string {
        const byLayer: Record<string, string[]> = {
            boundary: [],
            core: [],
            utility: [],
            config: [],
            test: [],
            unknown: [],
        };

        for (const file of files) {
            const layer = file.annotations.layer;
            const signals: string[] = [];

            if (file.annotations.touchesAuth) signals.push('auth');
            if (file.annotations.touchesDatabase) signals.push('db');
            if (file.annotations.touchesSecrets) signals.push('secrets');
            if (file.annotations.isEntryPoint) signals.push('entry');

            const signalStr = signals.length > 0 ? ` [${signals.join(',')}]` : '';
            byLayer[layer]!.push(`${file.id}:${file.path}${signalStr}`);
        }

        const lines: string[] = ['REPRESENTATIVE FILES BY LAYER:'];

        for (const [layer, paths] of Object.entries(byLayer)) {
            if (paths.length > 0) {
                lines.push(`\n[${layer.toUpperCase()}]`);
                paths.slice(0, 20).forEach(p => lines.push(`  ${p}`));
                if (paths.length > 20) {
                    lines.push(`  ... and ${paths.length - 20} more`);
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Format file index for worker assignment
     */
    static formatFileIndex(fileIndex: FileReference[]): string {
        const lines = ['FILE INDEX (use IDs for assignment):'];
        for (const ref of fileIndex) {
            lines.push(`${ref.id}:${ref.path}`);
        }
        return lines.join('\n');
    }
}
