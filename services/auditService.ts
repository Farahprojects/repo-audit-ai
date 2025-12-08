import { AuditStats, RepoReport, Issue, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { generateAuditReport } from './geminiService';
import { fetchRepoMap, parseGitHubUrl } from './githubService';
import { supabase } from '../src/integrations/supabase/client';
import { CostEstimator } from './costEstimator';

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
    auditConfig: any,
    getGitHubToken: () => Promise<string | undefined>,
    onProgress: (log: string) => void,
    onProgressUpdate: (progress: number) => void
  ): Promise<{ report: RepoReport; relatedAudits: AuditRecord[] }> {
    try {
      const repoInfo = parseGitHubUrl(repoUrl);
      if (!repoInfo) throw new Error("Invalid URL");

      // Step 1: Initialize
      onProgress(`[System] Initializing audit for ${repoInfo.owner}/${repoInfo.repo}...`);
      onProgressUpdate(10);

      // Step 2: Fetch Files (Real API)
      onProgress(`[Network] Connecting to GitHub API...`);
      await new Promise(r => setTimeout(r, 500));

      onProgress(`[Network] Downloading source tree (Map Only)...`);
      // Pass GitHub token for private repo access
      const githubToken = await getGitHubToken();
      // NEW: Fetch Map, NOT Content
      const fileMap = await fetchRepoMap(repoInfo.owner, repoInfo.repo, githubToken || undefined);

      onProgress(`[Success] Mapped ${fileMap.length} files.`);
      onProgressUpdate(40);

      // Step 3: Parse
      onProgress(`[Agent: Parser] Analyzing structure...`);
      await new Promise(r => setTimeout(r, 800)); // Simulate AST parsing time
      onProgressUpdate(60);

      // Step 4: AI Audit (Real API)
      onProgress(`[Agent: Security] Sending metadata to Brain...`);
      onProgress(`[System] Running ${tier.toUpperCase()} audit tier...`);

      // Get estimated tokens from server-side cost estimator
      let estimatedTokens: number | undefined;
      if (auditStats.fingerprint) {
        try {
          const estimate = await CostEstimator.estimateTokensAsync(tier, auditStats.fingerprint);
          estimatedTokens = estimate.estimatedTokens;
        } catch (err) {
          console.warn('Failed to get token estimate:', err);
          // Continue without estimate - server will calculate anyway
        }
      }

      const report = await generateAuditReport(repoInfo.repo, auditStats, fileMap, tier, repoUrl, estimatedTokens, auditConfig);

      onProgress(`[Success] Report generated successfully.`);
      onProgress(`[System] Finalizing health score: ${report.healthScore}/100`);
      onProgressUpdate(100);

      // Attach tier info to the report
      const enrichedReport: RepoReport = {
        ...report,
        tier: tier,
      };

      // Fetch all audits for this repo to populate tier navigation
      const { data: allAudits } = await supabase
        .from('audits')
        .select('id, repo_url, tier, health_score, summary, created_at, issues, extra_data')
        .eq('repo_url', repoUrl)
        .order('created_at', { ascending: false });

      return { report: enrichedReport, relatedAudits: allAudits || [] };

    } catch (e: any) {
      throw new Error(e.message);
    }
  }

  // Process historical audit data
  static processHistoricalAudit(audit: Tables<'audits'> & { extra_data?: any }): { report: RepoReport; relatedAudits: AuditRecord[] } {
    return new Promise(async (resolve) => {
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

      resolve({ report, relatedAudits: allAudits || [] });
    });
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
