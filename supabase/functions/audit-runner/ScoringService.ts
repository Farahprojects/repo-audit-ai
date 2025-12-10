import { calculateHealthScore, generateEgoDrivenSummary } from '../_shared/scoringUtils.ts';

export class ScoringService {
  static calculateHealthScoreAndSummary(issues: any[], appMap: any): { healthScore: number; summary: string } {
    // 🧠 EGO-BASED SCORING ALGORITHM (now shared)
    const fileCount = appMap.file_count || issues.length * 5; // Rough estimate
    const healthScore = calculateHealthScore({ issues, fileCount });

    // 🎯 EGO-DRIVEN SUMMARY SYSTEM (now shared)
    const summary = generateEgoDrivenSummary(issues);

    return { healthScore, summary };
  }
}
