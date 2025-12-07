export interface FileNode {
    path: string;
    type: 'file' | 'directory';
    size?: number;
    content?: string;
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
