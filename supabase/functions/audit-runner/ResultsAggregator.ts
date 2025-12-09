import { WorkerResult } from '../_shared/agents/types.ts';

export interface AggregatedReport {
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
}

export class ResultsAggregator {
  static aggregateWorkerResults(workerResults: WorkerResult[]): AggregatedReport {
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
    let mostSevereRiskLevel: string | null = null;
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
        const level = String(findings.riskLevel).toLowerCase();
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

    console.log(`📋 Aggregation complete: ${allIssues.length} total issues collected`);

    return {
      healthScore: healthScoreCount > 0 ? Math.round(healthScoreSum / healthScoreCount) : 50,
      summary: '', // Will be set by ScoringService
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
}
