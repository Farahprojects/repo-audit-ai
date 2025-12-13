/**
 * FileAnnotation - Observable file traits computed from path/metadata only
 * 
 * These are FACTS, not judgments. Preflight measures; brain interprets.
 * All signals derived from:
 * - Path structure
 * - File naming patterns  
 * - Directory conventions
 * - Size heuristics
 * 
 * NO content parsing. NO LLM. Pure static analysis.
 */
export interface FileAnnotation {
    // Location signals
    depth: number;                              // 0 = root, 1 = src/, 2 = src/components/
    isEntryPoint: boolean;                      // index.*, main.*, app.*, entry.*
    isConfig: boolean;                          // *.config.*, .env*, tsconfig, package.json
    isTest: boolean;                            // *.test.*, *.spec.*, __tests__/*

    // Content signals (inferred from naming/path patterns)
    touchesEnv: boolean;                        // env in path, .env files, config with env
    touchesAuth: boolean;                       // auth/, login, session, token, credential in path
    touchesDatabase: boolean;                   // db/, sql/, prisma/, drizzle/, migrations/, schema
    touchesApi: boolean;                        // api/, routes/, endpoints/, handlers/, controllers/
    touchesSecrets: boolean;                    // secrets/, keys/, .env, credentials/

    // Graph signals (estimated from patterns)
    fanOutEstimate: 'low' | 'medium' | 'high';  // Based on file type + location
    executionContext: 'build' | 'request' | 'unknown';

    // Layer classification (where in the architecture)
    layer: 'boundary' | 'core' | 'utility' | 'config' | 'test' | 'unknown';
}

/**
 * AnnotationSummary - Aggregate patterns for brain context
 * Tells the brain "here's what this repo looks like" without listing every file
 */
export interface AnnotationSummary {
    totalFiles: number;

    // Counts by layer
    byLayer: {
        boundary: number;
        core: number;
        utility: number;
        config: number;
        test: number;
        unknown: number;
    };

    // Counts by execution context
    byExecutionContext: {
        build: number;
        request: number;
        unknown: number;
    };

    // Key signals
    entryPoints: number;
    touchesAuth: number;
    touchesDatabase: number;
    touchesSecrets: number;
    touchesApi: number;
    highFanOut: number;

    // Depth distribution
    avgDepth: number;
    maxDepth: number;
}

/**
 * FileReference - Stable ID for worker assignment
 * Allows planner to assign by ID, worker fetches by ID
 */
export interface FileReference {
    id: string;     // e.g., "f_001" - stable across preflight lifecycle
    path: string;   // Full file path
    size: number;   // File size in bytes
    layer: string;  // Layer classification for grouping
}

/**
 * AnnotatedFileMap - Complete preflight file data with annotations
 */
export interface AnnotatedFileMap {
    // Representative files for brain context (limited count, high signal)
    display: AnnotatedFile[];

    // Aggregate patterns for brain reasoning
    summary: AnnotationSummary;

    // Full index for worker assignment (all files, minimal data)
    fileIndex: FileReference[];
}

/**
 * AnnotatedFile - Single file with annotations
 */
export interface AnnotatedFile {
    id: string;
    path: string;
    size: number;
    type: 'file' | 'summary';
    annotations: FileAnnotation;
}
