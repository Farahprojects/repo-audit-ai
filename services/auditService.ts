import { AuditStats, RepoReport, Issue, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { generateAuditReport } from './geminiService';
import { FileMapItem, parseGitHubUrl } from './githubService';
import { supabase } from '../src/integrations/supabase/client';
import { CostEstimator } from './costEstimator';
import { ErrorHandler, ErrorLogger } from './errorService';

export class AuditService {
  // Data normalization helpers for legacy data compatibility
  static ensureNormalized = (items: any[]): { title: string; detail: string }[] => {
    if (!items || !Array.isArray(items)) return [];
    // If already normalized (has title property), return as-is
    if (items.length > 0 && items[0]?.title !== undefined) {
      return items;
    }
    // Fallback for legacy data
    return items.map(item => {
      if (typeof item === 'string') {
        const colonIndex = item.indexOf(':');
        if (colonIndex > 0) {
          return { title: item.substring(0, colonIndex).trim(), detail: item.substring(colonIndex + 1).trim() };
        }
        return { title: item, detail: '' };
      }
      if (item?.area) return { title: item.area, detail: item.description || '' };
      return { title: String(item), detail: '' };
    });
  };

  static ensureRiskLevel = (level: any): 'critical' | 'high' | 'medium' | 'low' | undefined => {
    if (!level) return undefined;
    const normalized = String(level).toLowerCase();
    return ['critical', 'high', 'medium', 'low'].includes(normalized)
      ? normalized as 'critical' | 'high' | 'medium' | 'low'
      : undefined;
  };

  // Execute audit process
  static async executeAudit(
    repoUrl: string,
    tier: string,
    auditStats: AuditStats,
    fileMap: FileMapItem[],
    auditConfig: any,
    getGitHubToken: () => Promise<string | undefined>,
    onProgress: (log: string) => void,
    onProgressUpdate: (progress: number) => void,
    preflightId?: string  // Optional preflight ID for using stored preflight data
  ): Promise<{ report: RepoReport; relatedAudits: AuditRecord[] }> {
    const auditContext = { repoUrl, tier, stats: auditStats, fileCount: fileMap.length, hasPreflightId: !!preflightId };

    try {
      ErrorLogger.info('Starting audit execution', auditContext);

      const repoInfo = parseGitHubUrl(repoUrl);
      if (!repoInfo) {
        throw new Error("Invalid repository URL format");
      }

      // Step 1: Initialize
      onProgress(`[System] Initializing audit for ${repoInfo.owner}/${repoInfo.repo}...`);
      onProgressUpdate(10);

      // Step 2: Use pre-fetched file map
      onProgress(`[System] Using pre-fetched file map with ${fileMap.length} files...`);
      onProgressUpdate(40);

      // Step 3: Parse
      onProgress(`[Agent: Parser] Analyzing structure...`);
      await new Promise(r => setTimeout(r, 800)); // Simulate AST parsing time
      onProgressUpdate(60);

      // Step 3: Get GitHub token for file access
      // NEW: If we have a preflightId, we DON'T need to fetch the token here.
      // The backend will handle token decryption securely server-side.
      let githubToken: string | undefined;

      if (preflightId) {
        onProgress(`[Auth] Using secure server-side authentication...`);
        ErrorLogger.info('Skipping frontend token fetch - using preflightId for server-side auth');
      } else {
        // Legacy fallback: fetch token on frontend (should be phased out)
        onProgress(`[Auth] Getting GitHub access token...`);
        githubToken = await ErrorHandler.withErrorHandling(
          getGitHubToken,
          'getGitHubToken',
          { ...auditContext, operation: 'getTokenForAudit' }
        );
      }

      // Step 4: AI Audit (Real API)
      onProgress(`[Agent: Security] Sending metadata to Brain...`);
      onProgress(`[System] Running ${tier.toUpperCase()} audit tier...`);

      // Get estimated tokens from server-side cost estimator
      let estimatedTokens: number | undefined;
      if (auditStats.fingerprint) {
        const tokenResult = await ErrorHandler.safeAsync(
          () => CostEstimator.estimateTokensAsync(tier, auditStats.fingerprint),
          undefined,
          { ...auditContext, operation: 'estimateTokens' }
        );

        if (tokenResult.success) {
          estimatedTokens = tokenResult.data.estimatedTokens;
          ErrorLogger.debug('Token estimation successful', { estimatedTokens });
        } else if (tokenResult.success === false) {
          ErrorLogger.warn('Token estimation failed, continuing without estimate', tokenResult.error);
          // Continue without estimate - server will calculate anyway
        }
      }

      // Pass preflightId to generateAuditReport so backend can use stored preflight data
      const report = await ErrorHandler.withErrorHandling(
        () => generateAuditReport(repoInfo.repo, auditStats, fileMap, tier, repoUrl, estimatedTokens, auditConfig, githubToken, preflightId),
        'generateAuditReport',
        { ...auditContext, estimatedTokens, fileCount: fileMap.length, preflightId }
      );

      onProgress(`[Success] Report generated successfully.`);
      onProgress(`[System] Finalizing health score: ${report.healthScore}/100`);
      onProgressUpdate(100);

      // Attach tier info to the report
      const enrichedReport: RepoReport = {
        ...report,
        tier: tier,
      };

      // Fetch all audits for this repo to populate tier navigation
      const auditResult = await ErrorHandler.safeAsync(
        async () => {
          const { data, error } = await supabase
            .from('audits')
            .select('id, repo_url, tier, health_score, summary, created_at, issues, extra_data')
            .eq('repo_url', repoUrl)
            .order('created_at', { ascending: false });

          if (error) throw new Error(`Database error: ${error.message}`);
          return data || [];
        },
        [],
        { ...auditContext, operation: 'fetchRelatedAudits' }
      );

      const relatedAudits = auditResult.success ? auditResult.data : [];

      ErrorLogger.info('Audit execution completed successfully', {
        ...auditContext,
        issuesFound: report.issues.length,
        healthScore: report.healthScore,
        relatedAuditsCount: relatedAudits.length
      });

      return { report: enrichedReport, relatedAudits: relatedAudits as unknown as AuditRecord[] };

    } catch (error) {
      // Re-throw with proper context if it's already an AppError
      if (error instanceof Error) {
        ErrorLogger.error('Audit execution failed', error, auditContext);
        throw error;
      }

      // Wrap unknown errors
      const wrappedError = new Error(`Audit execution failed: ${String(error)}`);
      ErrorLogger.error('Audit execution failed with unknown error', wrappedError, auditContext);
      throw wrappedError;
    }
  }

  // Process historical audit data
  static async processHistoricalAudit(audit: Tables<'audits'> & { extra_data?: any }): Promise<{ report: RepoReport; relatedAudits: AuditRecord[] }> {
    const issues = (audit.issues as unknown as Issue[]) || [];
    const repoName = audit.repo_url.split('/').slice(-2).join('/');
    const extraData = audit.extra_data || {};

    // Fetch all audits for this repo to enable tier navigation
    const { data: allAudits } = await supabase
      .from('audits')
      .select('id, repo_url, tier, health_score, summary, created_at, issues, extra_data')
      .eq('repo_url', audit.repo_url)
      .order('created_at', { ascending: false });

    const stats: AuditStats = {
      files: issues.length > 0 ? Math.max(...issues.map((i: any) => i.filePath ? 1 : 0).concat([1])) : 1,
      tokens: 'N/A',
      size: 'N/A',
      language: 'Mixed',
      languagePercent: 100
    };

    const report: RepoReport = {
      repoName,
      healthScore: audit.health_score || 0,
      issues,
      summary: audit.summary || 'No summary available',
      stats,
      // Use normalized data from server, with fallback for legacy data
      topStrengths: this.ensureNormalized(extraData.topStrengths),
      topIssues: this.ensureNormalized(extraData.topWeaknesses),
      riskLevel: this.ensureRiskLevel(extraData.riskLevel),
      productionReady: extraData.productionReady,
      categoryAssessments: extraData.categoryAssessments,
      seniorDeveloperAssessment: extraData.seniorDeveloperAssessment,
      suspiciousFiles: extraData.suspiciousFiles,
      overallVerdict: extraData.overallVerdict,
      tier: audit.tier,
      auditId: audit.id,
    };

    return { report, relatedAudits: (allAudits || []) as unknown as AuditRecord[] };
  }

  // Process selected audit from history
  static processSelectedAudit(audit: AuditRecord): RepoReport {
    const issues = (audit.issues as Issue[]) || [];
    const repoName = audit.repo_url.split('/').slice(-2).join('/');
    const extraData = audit.extra_data || {};

    const stats: AuditStats = {
      files: issues.length > 0 ? Math.max(...issues.map((i: any) => i.filePath ? 1 : 0).concat([1])) : 1,
      tokens: 'N/A',
      size: 'N/A',
      language: 'Mixed',
      languagePercent: 100
    };

    return {
      repoName,
      healthScore: audit.health_score || 0,
      issues,
      summary: audit.summary || 'No summary available',
      stats,
      topStrengths: this.ensureNormalized(extraData.topStrengths),
      topIssues: this.ensureNormalized(extraData.topWeaknesses),
      riskLevel: this.ensureRiskLevel(extraData.riskLevel),
      productionReady: extraData.productionReady,
      categoryAssessments: extraData.categoryAssessments,
      seniorDeveloperAssessment: extraData.seniorDeveloperAssessment,
      suspiciousFiles: extraData.suspiciousFiles,
      overallVerdict: extraData.overallVerdict,
      tier: audit.tier,
      auditId: audit.id,
    };
  }
}
