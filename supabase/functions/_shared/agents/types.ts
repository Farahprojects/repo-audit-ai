export interface FileNode {
    path: string;
    type: 'file' | 'directory';
    size?: number;
    content?: string;
    url?: string;
    language?: string;
}

/**
 * PreflightData - Single source of truth for repository state
 * 
 * This data is computed once and stored in the database.
 * Agents receive this data and should NEVER re-check:
 * - Repository privacy status
 * - Token validity
 * - Fetch strategies
 * - File structure
 */
export interface PreflightData {
    id: string;
    repo_url: string;
    owner: string;
    repo: string;
    default_branch: string;

    // Repository file map - list of all files with metadata
    repo_map: FileNode[];

    // Stats snapshot
    stats: {
        files: number;
        tokens: string | number;
        size: string | number;
        language: string;
        languagePercent: number;
        defaultBranch?: string;
        isPrivate?: boolean;
    };

    // Fingerprint for complexity analysis
    fingerprint?: {
        files: number;
        functions: number;
        classes: number;
        imports: number;
        exports: number;
        branches: number;
        loops: number;
        comments: number;
        blankLines: number;
        language: string;
        languagePercent: number;
        totalLines: number;
        codeLines: number;
    };

    // Access control flags
    is_private: boolean;
    fetch_strategy: 'public' | 'authenticated';

    // Token validity (already validated)
    token_valid: boolean;

    // File count (cached for quick access)
    file_count: number;
}

export interface AuditContext {
    repoUrl: string;
    files: FileNode[];
    tier: string;

    // Preflight data - single source of truth
    // When present, agents should use this instead of re-computing
    preflight?: PreflightData;

    detectedStack?: {
        supabase: boolean;
        firebase: boolean;
        prisma: boolean;
        drizzle: boolean;
        neon: boolean;
        graphql: boolean;
        hasDockerfile: boolean;
    };
    githubToken?: string; // Legacy - kept for backward compatibility
    githubClient?: any; // GitHubAPIClient or GitHubAppClient instance
    metadata?: any;
}

// Pass 1: Scanner Output
export interface ScanResult {
    fileMap: Record<string, any>;
    projectType: string;
    frameworks: string[];
    dependencies: Record<string, string>;
    configFiles: string[];
    metadata: {
        totalFiles: number;
        totalTokens: number;
    };
}

// Pass 2: Expansion Output
export interface ArchitectureMap {
    apiRoutes: string[];
    databaseSchema: any[];
    authGuards: string[];
    externalServices: string[];
    dataFlows: {
        source: string;
        sink: string;
        data: string;
    }[];
}

// Pass 3: Correlation Output
export interface CorrelationGraph {
    nodes: string[];
    edges: {
        from: string;
        to: string;
        relation: string;
    }[];
    potentialIssues: {
        type: string;
        description: string;
        files: string[];
        confidence: number;
    }[];
}

// Pass 4: Enrichment Output
export interface RiskAssessment {
    securityScore: number;
    performanceScore: number;
    maintainabilityScore: number;
    findings: {
        id: string;
        category: string;
        severity: 'critical' | 'warning' | 'info';
        title: string;
        description: string;
        filePath: string;
        line?: number;
        snippet?: string;
        remediation?: string;
        cwe?: string;
    }[];
}

// --- SWARM ARCHITECTURE TYPES ---

export interface WorkerTask {
    id: string;
    role: string; // e.g. "Security Specialist", "Database Auditor"
    instruction: string; // "Check RLS policies in schema.sql"
    targetFiles: string[]; // List of file paths to fetch
}

export interface WorkerResult {
    taskId: string;
    findings: any; // Raw finding object - no serialization for efficiency
    tokenUsage: number;
}

export interface SwarmPlan {
    tasks: WorkerTask[];
    focusArea: string;
}

// Pass 5: Synthesis Output (Final Report)
export interface FinalAuditReport {
    healthScore: number;
    summary: string;
    topStrengths: { title: string; detail: string }[];
    topWeaknesses: { title: string; detail: string }[];
    issues: any[]; // Combined findings
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    productionReady: boolean;
}
