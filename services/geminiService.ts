import { RepoReport } from "../types";
import { supabase } from "../src/integrations/supabase/client";
import { ErrorHandler, ErrorLogger } from "./errorService";

/**
 * Generate audit report - server-side only approach
 * 
 * The frontend ONLY passes:
 * - repoUrl: The repository URL
 * - tier: The audit tier to run
 * - preflightId: The ID of the preflight record (source of truth)
 * 
 * The backend handles EVERYTHING else:
 * - Fetches file map from preflights table
 * - Fetches GitHub token from github_accounts if is_private=true
 * - Calculates token estimates
 * - Runs the audit pipeline
 */
export const generateAuditReport = async (
  repoName: string,
  stats: any,
  tier: string = 'shape',
  fullRepoUrl?: string,
  preflightId?: string
): Promise<RepoReport & { tierData?: any }> => {
  const context = {
    repoName,
    tier,
    fullRepoUrl,
    preflightId
  };

  ErrorLogger.info('Starting audit report generation (server-side)', context);

  if (!preflightId) {
    const error = new Error('preflightId is required for audits. Please run preflight first.');
    ErrorLogger.error('Missing preflightId', error, context);
    throw error;
  }

  try {
    // MINIMAL request body - backend fetches everything from preflight
    const requestBody = {
      repoUrl: fullRepoUrl || `https://github.com/${repoName}`,
      tier,
      preflightId
      // NO files, NO githubToken, NO estimatedTokens - all server-side now
    };

    // Call Supabase edge function
    const { data, error } = await supabase.functions.invoke('audit-runner', {
      body: requestBody
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
