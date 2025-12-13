// Results Processing Service - Handles aggregation, scoring, and response formatting
// Follows Single Responsibility Principle: Only processes and formats results

import { WorkerResult } from '../agents/types.ts';
import { calculateHealthScore, generateEgoDrivenSummary } from '../scoringUtils.ts';
import { normalizeStrengthsOrIssues, normalizeRiskLevel } from '../normalization.ts';
import { normalizeIssues } from '../utils.ts';

export interface ProcessedResults {
  healthScore: number;
  summary: string;
  issues: any[];
  riskLevel: string;
  topStrengths: any[];
  topIssues: any[];
  suspiciousFiles: any[] | null;
  categoryAssessments: any | null;
  seniorDeveloperAssessment: any | null;
  overallVerdict: any | null;
  appMap: any;
}

export class ResultsProcessingService {
  /**
   * Process and aggregate worker results into final audit results
   */
  processResults(workerResults: WorkerResult[]): ProcessedResults {
    // Aggregate findings from all workers
    const aggregatedReport = this.aggregateWorkerResults(workerResults);

    // Normalize the results
    const normalizedResults = this.normalizeResults(aggregatedReport);

    return normalizedResults;
  }

  /**
   * Aggregate worker results (extracted from audit-runner)
   */
  private aggregateWorkerResults(workerResults: WorkerResult[]): {
    healthScore: number;
    summary: string;
    issues: any[];
    topStrengths: any[];
    topWeaknesses: any[];
    riskLevel: string | null;
    productionReady: boolean | null;
    categoryAssessments: any | null;
    seniorDeveloperAssessment: any | null;
    suspiciousFiles: any[] | null;
    overallVerdict: string | null;
    appMap: any;
  } {
    if (!workerResults || workerResults.length === 0) {
      return {
        healthScore: 50,
        summary: 'No analysis results available.',
        issues: [],
        topStrengths: [],
        topWeaknesses: [],
        riskLevel: null,
        productionReady: null,
        categoryAssessments: null,
        seniorDeveloperAssessment: null,
        suspiciousFiles: null,
        overallVerdict: null,
        appMap: {}
      };
    }

    // Aggregate all findings from workers
    const allIssues: any[] = [];
    const allStrengths: any[] = [];
    const allWeaknesses: any[] = [];
    const allSuspiciousFiles: any[] = [];
    let healthScoreSum = 0;
    let healthScoreCount = 0;
    let mostSevereRiskLevel: keyof typeof riskOrder | null = null;
    let productionReady: boolean | null = null;
    let categoryAssessments: any = null;
    let seniorDeveloperAssessment: any = null;
    let overallVerdict: string | null = null;

    // Aggregate app maps from all workers
    const combinedAppMap = workerResults.reduce((map: any, result) => {
      const workerMap = result.findings.appMap || {};
      return {
        languages: [...new Set([...(map.languages || []), ...(workerMap.languages || [])])],
        frameworks: [...new Set([...(map.frameworks || []), ...(workerMap.frameworks || [])])],
        directory_count: Math.max(map.directory_count || 0, workerMap.directory_count || 0),
        file_count: Math.max(map.file_count || 0, workerMap.file_count || 0),
        complexity: workerMap.complexity || map.complexity || 'medium',
        key_files: [...new Set([...(map.key_files || []), ...(workerMap.key_files || [])])],
        architecture_patterns: [...new Set([...(map.architecture_patterns || []), ...(workerMap.architecture_patterns || [])])],
        testing_approach: workerMap.testing_approach || map.testing_approach || 'minimal',
        config_approach: workerMap.config_approach || map.config_approach || 'centralized'
      };
    }, {});

    console.log(`🔄 Aggregating results from ${workerResults.length} workers`);

    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    for (const result of workerResults) {
      const findings = result.findings || {};

      console.log(`🔍 Processing worker result:`, {
        taskId: result.taskId,
        issuesCount: findings.issues?.length || 0,
        findingsType: typeof findings
      });

      // Aggregate issues
      if (findings.issues && Array.isArray(findings.issues)) {
        allIssues.push(...findings.issues);
      }

      // Aggregate strengths
      if (findings.topStrengths && Array.isArray(findings.topStrengths)) {
        allStrengths.push(...findings.topStrengths);
      }

      // Aggregate weaknesses
      if (findings.topWeaknesses && Array.isArray(findings.topWeaknesses)) {
        allWeaknesses.push(...findings.topWeaknesses);
      }

      // Aggregate suspicious files
      if (findings.suspiciousFiles && Array.isArray(findings.suspiciousFiles)) {
        allSuspiciousFiles.push(...findings.suspiciousFiles);
      }

      // Track health scores for averaging
      if (typeof findings.healthScore === 'number') {
        healthScoreSum += findings.healthScore;
        healthScoreCount++;
      }

      // Track most severe risk level
      if (findings.riskLevel) {
        const level = String(findings.riskLevel).toLowerCase() as keyof typeof riskOrder;
        if (!mostSevereRiskLevel || (riskOrder[level] ?? 99) < (riskOrder[mostSevereRiskLevel] ?? 99)) {
          mostSevereRiskLevel = level;
        }
      }

      // Take first non-null values for single-value fields
      if (findings.productionReady !== undefined && productionReady === null) {
        productionReady = findings.productionReady;
      }
      if (findings.categoryAssessments && !categoryAssessments) {
        categoryAssessments = findings.categoryAssessments;
      }
      if (findings.seniorDeveloperAssessment && !seniorDeveloperAssessment) {
        seniorDeveloperAssessment = findings.seniorDeveloperAssessment;
      }
      if (findings.overallVerdict && !overallVerdict) {
        overallVerdict = findings.overallVerdict;
      }
    }

    // Calculate final health score using shared utility
    const fileCount = combinedAppMap.file_count || allIssues.length * 5; // Rough estimate
    const finalHealthScore = calculateHealthScore({ issues: allIssues, fileCount });

    // Generate ego-driven summary using shared utility
    const summary = generateEgoDrivenSummary(allIssues);

    console.log(`📋 Aggregation complete: ${allIssues.length} total issues collected`);

    return {
      healthScore: finalHealthScore,
      summary: summary,
      issues: allIssues,
      topStrengths: allStrengths.slice(0, 5), // Limit to top 5
      topWeaknesses: allWeaknesses.slice(0, 5), // Limit to top 5
      riskLevel: mostSevereRiskLevel,
      productionReady,
      categoryAssessments,
      seniorDeveloperAssessment,
      suspiciousFiles: allSuspiciousFiles.length > 0 ? allSuspiciousFiles : null,
      overallVerdict,
      appMap: combinedAppMap,
    };
  }

  /**
   * Normalize results for database storage and API response
   */
  private normalizeResults(aggregatedReport: any): ProcessedResults {
    return {
      healthScore: aggregatedReport.healthScore,
      summary: aggregatedReport.summary,
      issues: this.normalizeIssues(aggregatedReport.issues),
      riskLevel: normalizeRiskLevel(aggregatedReport.riskLevel) || 'low',
      topStrengths: normalizeStrengthsOrIssues(aggregatedReport.topStrengths),
      topIssues: normalizeStrengthsOrIssues(aggregatedReport.topWeaknesses),
      suspiciousFiles: aggregatedReport.suspiciousFiles,
      categoryAssessments: aggregatedReport.categoryAssessments,
      seniorDeveloperAssessment: aggregatedReport.seniorDeveloperAssessment,
      overallVerdict: aggregatedReport.overallVerdict,
      appMap: aggregatedReport.appMap,
    };
  }

  /**
   * Normalize issues for database storage
   */
  private normalizeIssues(issues: any[]): any[] {
    return normalizeIssues(issues, true); // Include CWE for audit results
  }
}
