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
   * Phase 1: Create Audit Plan
   */
  static async planAudit(
    preflightId: string,
    tier: string
  ): Promise<{ plan: any; detectedStack: any; usage: any }> {
    const { data: result, error } = await supabase.functions.invoke('audit-planner', {
      body: { preflightId, tier }
    });

    if (error) throw error;
    return result;
  }

  /**
   * Phase 2: Run Single Worker Task
   */
  static async runAuditTask(
    preflightId: string,
    task: any
  ): Promise<{ result: any; usage: any }> {
    const { data, error } = await supabase.functions.invoke('audit-worker', {
      body: {
        preflightId,
        taskId: task.id,
        instruction: task.instruction,
        role: task.role,
        targetFiles: task.targetFiles
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Phase 3: Synthesize & Save
   */
  static async synthesizeAuditResults(
    preflightId: string,
    workerResults: any[],
    tier: string,
    plannerUsage: any
  ): Promise<RepoReport> {
    const { data, error } = await supabase.functions.invoke('audit-coordinator', {
      body: {
        preflightId,
        workerResults,
        tier,
        plannerUsage
      }
    });

    if (error) throw error;

    // Normalize return to RepoReport shape
    return {
      ...data,
      tier
    };
  }

  /**
   * @deprecated logic moved to client-side orchestration hooks
   */
  static async executeAudit(
    repoUrl: string,
    tier: string,
    auditStats: AuditStats,
    preflightId: string,
    onProgress: (log: string) => void,
    onProgressUpdate: (progress: number) => void
  ): Promise<{ report: RepoReport; relatedAudits: AuditRecord[] }> {
    throw new Error("Use useAuditOrchestrator hooks instead of monolithic executeAudit. The architecture has been refactored to client-side orchestration.");
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
