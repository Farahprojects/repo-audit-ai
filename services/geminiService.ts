import { RepoReport } from "../types";
import { supabase } from "../src/integrations/supabase/client";
import { ErrorHandler, ErrorLogger } from "./errorService";

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
  const context = {
    repoName,
    tier,
    fileCount: fileMap.length,
    estimatedTokens,
    fullRepoUrl
  };

  ErrorLogger.info('Starting audit report generation', context);

  try {
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
      ErrorHandler.handleGeminiError(error, 'invoke-audit-runner', context);
    }

    if (!data) {
      const error = new Error('No audit data received from server');
      ErrorLogger.error('Audit runner returned no data', error, context);
      throw error;
    }

    if (!data.healthScore || !Array.isArray(data.issues)) {
      const error = new Error('Invalid audit data format received from server');
      ErrorLogger.error('Audit runner returned malformed data', error, {
        ...context,
        hasHealthScore: !!data.healthScore,
        hasIssues: Array.isArray(data.issues)
      });
      throw error;
    }

    const report = {
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

    ErrorLogger.info('Audit report generation completed', {
      ...context,
      issuesFound: data.issues.length,
      healthScore: data.healthScore
    });

    return report;

  } catch (error) {
    // If it's already an AppError, re-throw it
    if (error instanceof Error && error.name !== 'Error') {
      throw error;
    }

    // Handle other errors as Gemini errors
    ErrorHandler.handleGeminiError(error, 'generate-audit-report', context);
  }
};
