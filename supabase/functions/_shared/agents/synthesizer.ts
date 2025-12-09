// Synthesizer Agent - Merges worker findings into unified report
// Wraps the synthesis utilities for use in the audit pipeline

import { synthesizeFindings, transformIssuesToFrontend, WorkerFinding } from '../synthesis.ts';
import { WorkerResult } from './types.ts';

export interface SynthesizerInput {
    workerResults: WorkerResult[];
    tier: string;
    repoUrl: string;
}

export interface SynthesizerOutput {
    healthScore: number;
    summary: string;
    issues: any[];
    workerStats: {
        totalChunks: number;
        totalTokensAnalyzed: number;
        avgConfidence: number;
    };
    crossFileFlags: string[];
    uncertainties: string[];
    extraData: Record<string, any>;
}

/**
 * Convert WorkerResult to WorkerFinding format for synthesis
 */
function workerResultToFinding(result: WorkerResult, index: number): WorkerFinding {
    const findings = result.findings || {};
    
    return {
        chunkId: result.taskId || `worker-${index}`,
        chunkName: findings.chunkName || result.taskId || `worker-${index}`,
        tokensAnalyzed: result.tokenUsage || 0,
        confidence: findings.confidence || 0.8,
        localScore: findings.localScore || findings.healthScore || 50,
        issues: (findings.issues || []).map((issue: any, idx: number) => ({
            id: issue.id || `${result.taskId}-issue-${idx}`,
            severity: mapSeverity(issue.severity),
            category: issue.category || 'general',
            title: issue.title || 'Untitled Issue',
            description: issue.description || '',
            file: issue.file || issue.filePath || '',
            line: issue.line || issue.lineNumber || null,
            badCode: issue.badCode,
            fixedCode: issue.fixedCode,
            suggestion: issue.suggestion,
        })),
        crossFileFlags: findings.crossFileFlags || [],
        uncertainties: findings.uncertainties || [],
    };
}

/**
 * Map various severity formats to standard format
 */
function mapSeverity(severity: string | undefined): 'critical' | 'warning' | 'info' {
    if (!severity) return 'info';
    const lower = severity.toLowerCase();
    if (lower === 'critical' || lower === 'error' || lower === 'high') return 'critical';
    if (lower === 'warning' || lower === 'medium') return 'warning';
    return 'info';
}

/**
 * Extract extra data from worker results (for enriched reports)
 */
function extractExtraData(workerResults: WorkerResult[]): Record<string, any> {
    const extraData: Record<string, any> = {};
    
    for (const result of workerResults) {
        const findings = result.findings || {};
        // Merge any extra fields from worker results
        if (findings.topStrengths) extraData.topStrengths = findings.topStrengths;
        if (findings.topWeaknesses) extraData.topWeaknesses = findings.topWeaknesses;
        if (findings.riskLevel) extraData.riskLevel = findings.riskLevel;
        if (findings.productionReady !== undefined) extraData.productionReady = findings.productionReady;
        if (findings.categoryAssessments) extraData.categoryAssessments = findings.categoryAssessments;
        if (findings.seniorDeveloperAssessment) extraData.seniorDeveloperAssessment = findings.seniorDeveloperAssessment;
        if (findings.suspiciousFiles) extraData.suspiciousFiles = findings.suspiciousFiles;
        if (findings.overallVerdict) extraData.overallVerdict = findings.overallVerdict;
    }
    
    return extraData;
}

/**
 * Run the synthesizer to merge all worker findings
 */
export async function runSynthesizer(input: SynthesizerInput): Promise<SynthesizerOutput> {
    console.log(`🔬 [Synthesizer] Starting synthesis for ${input.workerResults.length} worker results`);
    
    if (!input.workerResults || input.workerResults.length === 0) {
        console.warn('⚠️ [Synthesizer] No worker results to synthesize');
        return {
            healthScore: 50,
            summary: 'No analysis results available.',
            issues: [],
            workerStats: {
                totalChunks: 0,
                totalTokensAnalyzed: 0,
                avgConfidence: 0,
            },
            crossFileFlags: [],
            uncertainties: [],
            extraData: {},
        };
    }
    
    // Convert worker results to findings format
    const findings: WorkerFinding[] = input.workerResults.map((r, i) => workerResultToFinding(r, i));
    
    // Run synthesis
    const synthesisResult = synthesizeFindings(findings);
    
    // Transform issues to frontend format
    const frontendIssues = transformIssuesToFrontend(synthesisResult.issues);
    
    // Extract extra data for enriched reports
    const extraData = extractExtraData(input.workerResults);
    
    console.log(`✅ [Synthesizer] Synthesis complete: score=${synthesisResult.healthScore}, issues=${frontendIssues.length}`);
    
    return {
        healthScore: synthesisResult.healthScore,
        summary: synthesisResult.summary,
        issues: frontendIssues,
        workerStats: synthesisResult.workerStats,
        crossFileFlags: synthesisResult.crossFileFlags,
        uncertainties: synthesisResult.uncertainties,
        extraData,
    };
}
