// Synthesis utilities for multi-agent audit system
// Merges worker findings into unified report

import { normalizeIssues } from './utils.ts';
import { deduplicateIssues } from './scoringUtils.ts';

export interface WorkerFinding {
    chunkId: string;
    chunkName: string;
    tokensAnalyzed: number;
    confidence: number; // 0-1
    localScore: number; // 0-100
    issues: WorkerIssue[];
    crossFileFlags: string[];
    uncertainties: string[];
}

export interface WorkerIssue {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    description: string;
    file: string;
    line: number | null;
    badCode?: string;
    fixedCode?: string;
    suggestion?: string;
}

export interface SynthesisResult {
    healthScore: number;
    summary: string;
    issues: WorkerIssue[];
    workerStats: {
        totalChunks: number;
        totalTokensAnalyzed: number;
        avgConfidence: number;
    };
    crossFileFlags: string[];
    uncertainties: string[];
}

/**
 * Sort issues by severity (critical first)
 */
function sortBySeverity(issues: WorkerIssue[]): WorkerIssue[] {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return [...issues].sort((a, b) =>
        severityOrder[a.severity] - severityOrder[b.severity]
    );
}

/**
 * Calculate weighted average score from worker findings
 * Weights based on tokens analyzed (larger chunks = more weight)
 */
function calculateWeightedScore(findings: WorkerFinding[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const finding of findings) {
        const weight = finding.tokensAnalyzed * finding.confidence;
        weightedSum += finding.localScore * weight;
        totalWeight += weight;
    }

    if (totalWeight === 0) return 50; // Default if no data

    return Math.round(weightedSum / totalWeight);
}

/**
 * Apply penalties for cross-file issues and low confidence
 */
function applyPenalties(
    baseScore: number,
    crossFileFlags: string[],
    uncertainties: string[],
    avgConfidence: number
): number {
    let score = baseScore;

    // Penalty for cross-file issues (2 points each, max 10)
    score -= Math.min(crossFileFlags.length * 2, 10);

    // Penalty for uncertainties (1 point each, max 5)
    score -= Math.min(uncertainties.length, 5);

    // Penalty for low confidence (up to 5 points)
    if (avgConfidence < 0.8) {
        score -= Math.round((0.8 - avgConfidence) * 25);
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Generate executive summary from worker findings
 */
function generateSummary(
    score: number,
    issues: WorkerIssue[],
    chunks: number
): string {
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    let quality: string;
    if (score >= 80) quality = 'excellent';
    else if (score >= 60) quality = 'good with room for improvement';
    else if (score >= 40) quality = 'needs significant work';
    else quality = 'requires immediate attention';

    let summary = `Multi-agent analysis across ${chunks} code regions found ${issues.length} issues. `;
    summary += `Overall code quality is ${quality}. `;

    if (criticalCount > 0) {
        summary += `${criticalCount} critical issue${criticalCount > 1 ? 's require' : ' requires'} immediate attention. `;
    }
    if (warningCount > 0) {
        summary += `${warningCount} warning${warningCount > 1 ? 's' : ''} should be addressed soon.`;
    }

    return summary.trim();
}

/**
 * Main synthesis function
 * Merges findings from all workers into a unified report
 */
export function synthesizeFindings(findings: WorkerFinding[]): SynthesisResult {
    if (findings.length === 0) {
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
        };
    }

    // Collect all issues
    const allIssues = findings.flatMap(f => f.issues);

    // Deduplicate using centralized function
    const { minimizedIssues: uniqueIssues } = deduplicateIssues(allIssues);

    // Sort by severity
    const sortedIssues = sortBySeverity(uniqueIssues);

    // Collect cross-file flags and uncertainties
    const crossFileFlags = [...new Set(findings.flatMap(f => f.crossFileFlags))];
    const uncertainties = [...new Set(findings.flatMap(f => f.uncertainties))];

    // Calculate stats
    const totalTokensAnalyzed = findings.reduce((sum, f) => sum + f.tokensAnalyzed, 0);
    const avgConfidence = findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length;

    // Calculate weighted score
    const baseScore = calculateWeightedScore(findings);

    // Apply penalties
    const finalScore = applyPenalties(baseScore, crossFileFlags, uncertainties, avgConfidence);

    // Generate summary
    const summary = generateSummary(finalScore, sortedIssues, findings.length);

    console.log(`   - Input: ${findings.length} worker findings, ${allIssues.length} total issues`);
    console.log(`   - Output: ${sortedIssues.length} unique issues, score ${finalScore}/100`);

    return {
        healthScore: finalScore,
        summary,
        issues: sortedIssues,
        workerStats: {
            totalChunks: findings.length,
            totalTokensAnalyzed,
            avgConfidence: Math.round(avgConfidence * 100) / 100,
        },
        crossFileFlags,
        uncertainties,
    };
}

/**
 * Transform worker issues to match frontend Issue interface
 */
export function transformIssuesToFrontend(issues: WorkerIssue[]): any[] {
    return normalizeIssues(issues, false); // Don't include CWE for synthesis
}
