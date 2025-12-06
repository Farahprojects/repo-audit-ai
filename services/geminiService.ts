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
  fileContents: { path: string, content: string }[],
  tier: string = 'shape'
): Promise<RepoReport & { tierData?: any }> => {

  // Map frontend tier to backend tier
  const backendTier = TIER_MAPPING[tier] || 'shape';

  // Call Supabase edge function instead of direct API
  const { data, error } = await supabase.functions.invoke('audit-runner', {
    body: {
      repoUrl: `https://github.com/${repoName}`,
      files: fileContents,
      tier: backendTier
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
    // Include tier-specific metadata
    tierData: {
      tier: data.tier,
      maturityAssessment: data.maturityAssessment,
      topStrengths: data.topStrengths,
      topIssues: data.topIssues,
      craftGrade: data.craftGrade,
      seniorSignals: data.seniorSignals,
      productionReady: data.productionReady,
      productionSafe: data.productionSafe,
      riskLevel: data.riskLevel,
      topPerformanceRisks: data.topPerformanceRisks,
      aiAntiPatterns: data.aiAntiPatterns,
      topVulnerabilities: data.topVulnerabilities,
      exposedSecrets: data.exposedSecrets,
      rlsProblems: data.rlsProblems,
      // Multi-agent specific data
      multiAgent: data.multiAgent,
      additionalInsights: data.additionalInsights,
    }
  };
};
