import { AuditStats, RepoReport, Issue, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { generateAuditReport } from './geminiService';
import { parseGitHubUrl } from './githubService';
import { supabase } from '../src/integrations/supabase/client';
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

  /**
   * Execute audit process - server-side approach
   * 
   * preflightId is REQUIRED - it's the single source of truth.
   * The backend fetches all data (files, tokens, stats) from the preflights table.
   */
  static async executeAudit(
    repoUrl: string,
    tier: string,
    auditStats: AuditStats,
    preflightId: string,
    onProgress: (log: string) => void,
    onProgressUpdate: (progress: number) => void
  ): Promise<{ report: RepoReport; relatedAudits: AuditRecord[] }> {
    const auditContext = { repoUrl, tier, preflightId };

    if (!preflightId) {
      throw new Error('preflightId is required for audits');
    }

    try {
      ErrorLogger.info('Starting audit execution (server-side)', auditContext);

      const repoInfo = parseGitHubUrl(repoUrl);
      if (!repoInfo) {
        throw new Error("Invalid repository URL format");
      }

      // Step 1: Initialize
      onProgress(`[System] Initializing audit for ${repoInfo.owner}/${repoInfo.repo}...`);
      onProgressUpdate(10);

      // Step 2: Server handles file fetching via preflight
      onProgress(`[System] Server fetching files from preflight...`);
      onProgressUpdate(40);

      // Step 3: Parse
      onProgress(`[Agent: Parser] Analyzing structure...`);
      await new Promise(r => setTimeout(r, 800));
      onProgressUpdate(60);

      // Step 4: Run audit - backend handles EVERYTHING
      onProgress(`[System] Running ${tier.toUpperCase()} audit tier...`);
      onProgress(`[Auth] Using secure server-side authentication...`);

      // Pass ONLY what's needed - backend fetches the rest from preflight
      const report = await ErrorHandler.withErrorHandling(
        () => generateAuditReport(
          repoInfo.repo,
          auditStats,
          tier,
          repoUrl,
          preflightId
        ),
        'generateAuditReport',
        auditContext
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
      if (error instanceof Error) {
        ErrorLogger.error('Audit execution failed', error, auditContext);
        throw error;
      }

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
