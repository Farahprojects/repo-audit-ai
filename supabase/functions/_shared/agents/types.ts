export interface FileNode {
    path: string;
    type: 'file' | 'directory';
    size?: number;
    content?: string;
    url?: string;
    language?: string;
}

export interface AuditContext {
    repoUrl: string;
    files: FileNode[];
    tier: string;
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
    findings: string; // Raw text/JSON analysis from the worker
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
