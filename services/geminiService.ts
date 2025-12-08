import { RepoReport } from "../types";
import { supabase } from "../src/integrations/supabase/client";

// Tier mapping moved to cost-estimator edge function for security
// Frontend just passes tier name, backend validates and maps

export const generateAuditReport = async (
  repoName: string,
  stats: any,
  fileMap: any[],
  tier: string = 'shape',
  fullRepoUrl?: string,
  estimatedTokens?: number,
  config?: any
): Promise<RepoReport & { tierData?: any }> => {

  // Call Supabase edge function - tier validation happens server-side
  const { data, error } = await supabase.functions.invoke('audit-runner', {
    body: {
      repoUrl: fullRepoUrl || `https://github.com/${repoName}`,
      files: fileMap,
      tier, // Pass tier as-is, backend validates
      estimatedTokens,
      config
    }
  });

  if (error) {
    throw new Error(`Audit failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('No audit data received from server');
  }

  return {
    repoName,
    stats,
    healthScore: data.healthScore,
    summary: data.summary,
    issues: data.issues,
    // Enhanced report fields from coordinator
    topStrengths: data.topStrengths,
    topIssues: data.topIssues,
    suspiciousFiles: data.suspiciousFiles,
    categoryAssessments: data.categoryAssessments,
    seniorDeveloperAssessment: data.seniorDeveloperAssessment,
    overallVerdict: data.overallVerdict,
    productionReady: data.productionReady,
    riskLevel: data.riskLevel,
    // Detected stack for deep audit suggestions
    detectedStack: data.meta?.detectedStack,
    // Include tier-specific metadata
    tierData: {
      tier: data.tier,
      multiAgent: data.multiAgent,
    }
  };
};
