import { RepoReport } from "../types";
import { supabase } from "../src/integrations/supabase/client";

// Map frontend tier names to backend audit types
const TIER_MAPPING: Record<string, string> = {
  'lite': 'shape',           // Free tier: Repo Shape Check
  'deep': 'conventions',     // Paid tier: Senior Conventions Check
  'ultra': 'security',       // Premium tier: Security Audit
  'performance': 'performance', // Can be called directly
  'security': 'security',       // Can be called directly
  'shape': 'shape',             // Can be called directly
  'conventions': 'conventions', // Can be called directly
};

export const generateAuditReport = async (
  repoName: string,
  stats: any,
  fileMap: any[], // Was fileContents
  tier: string = 'shape',
  fullRepoUrl?: string, // Add optional full URL parameter
  estimatedTokens?: number, // Add estimated tokens parameter
  config?: any // Add optional config for deep audits
): Promise<RepoReport & { tierData?: any }> => {

  // Map frontend tier to backend tier
  // If tier is specific (like supabase_deep_dive), use it directly if not in mapping, or add to mapping.
  const backendTier = TIER_MAPPING[tier] || tier;

  // Call Supabase edge function instead of direct API
  const { data, error } = await supabase.functions.invoke('audit-runner', {
    body: {
      repoUrl: fullRepoUrl || `https://github.com/${repoName}`,
      files: fileMap, // Send the MAP, not the content
      tier: backendTier,
      estimatedTokens,
      config // Pass extra config
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
    // Include tier-specific metadata
    tierData: {
      tier: data.tier,
      multiAgent: data.multiAgent,
    }
  };
};
