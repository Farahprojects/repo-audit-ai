// Shared scoring utilities for ego-based scoring algorithm and ego-driven summary system
// Extracted from audit-runner and audit-coordinator to eliminate code duplication

export interface ScoringInput {
  issues: any[];
  fileCount: number;
}

export interface ScoringResult {
  healthScore: number;
  summary: string;
}

export interface IssueDeduplicationResult {
  minimizedIssues: any[];
  uniqueIssuesMap: Map<string, any>;
}

/**
 * 🧠 EGO-BASED SCORING ALGORITHM
 * Calculate health score using weighted severity and project size normalization
 */
export function calculateHealthScore({ issues, fileCount }: ScoringInput): number {
  // Step 1: Weighted Severity Score
  const severityWeights = { critical: 5, warning: 2, info: 1 };
  let rawScore = 0;

  issues.forEach((issue: any) => {
    const severity = (issue.severity || 'info').toLowerCase();
    const weight = severityWeights[severity as keyof typeof severityWeights] || 1;
    rawScore += weight;
  });

  // Step 2: Normalize Based on Project Size
  const normalized = rawScore / Math.log(fileCount + 8); // Log normalization

  // Step 3: Convert to 0-100 Final Score
  return Math.max(0, Math.min(100, Math.round(100 - normalized)));
}

/**
 * 🔄 ISSUE DEDUPLICATION
 * Remove duplicate issues based on title + filename to avoid noise
 */
export function deduplicateIssues(allIssues: any[]): IssueDeduplicationResult {
  const uniqueIssuesMap = new Map<string, any>();

  allIssues.forEach((issue: any) => {
    const key = `${issue.title}-${issue.filePath || issue.file}`;
    if (!uniqueIssuesMap.has(key)) {
      uniqueIssuesMap.set(key, issue);
    }
  });

  const minimizedIssues = Array.from(uniqueIssuesMap.values());

  return {
    minimizedIssues,
    uniqueIssuesMap
  };
}

/**
 * 🎯 EGO-DRIVEN SUMMARY SYSTEM
 * Generate psychologically effective summaries based on ego archetypes
 */
export function generateEgoDrivenSummary(issues: any[]): string {
  const criticalCount = issues.filter((i: any) => i.severity?.toLowerCase() === 'critical').length;
  const warningCount = issues.filter((i: any) => i.severity?.toLowerCase() === 'warning').length;

  // Determine ego archetype based on issue severity distribution
  if (criticalCount <= 1 && warningCount < 5) {
    // 🏆 SENIOR ENGINEER ENERGY
    return `This repo carries the signature of someone who knows what they're doing. The structure is coherent, conventions are respected, and most of the issues found reflect fine-tuning rather than fundamental gaps. This feels like work from a strong mid-to-senior engineer who understands patterns, separation of concerns, and long-term maintainability.`;
  } else if (criticalCount <= 3) {
    // 💪 SOLID FOUNDATION NEEDS PUSH
    return `There's a clear foundation here — the architecture shows intent, and the patterns indicate someone who understands modern development practices. But the app is sitting right on the edge of breaking into a higher tier. With a few structural cleanups and more consistency across modules, this could easily shine like a polished product built by a confident engineer.`;
  } else if (criticalCount <= 7) {
    // 🧠 SMART BUT NEEDS DISCIPLINE
    return `This codebase has moments of real talent — you can see the problem-solving ability and raw capability in the stronger sections. The gaps don't come from incompetence; they come from lack of consistency or rushed delivery. With more structure, this repo could reflect the level of skill that's clearly present in the stronger sections.`;
  } else {
    // 🔄 RESPECTFUL REBUILD NEEDED
    return `There's a lot of passion in this project, but it feels like something built without the constraints or patterns of a production environment. The ideas are strong — the execution just needs a reset and a more deliberate structure. With a rebuild guided by clear best practices, this could transform from a chaotic prototype into something that genuinely reflects your capability.`;
  }
}
