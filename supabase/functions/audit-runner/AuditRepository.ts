import { normalizeStrengthsOrIssues, normalizeRiskLevel } from '../_shared/normalization.ts';

export interface AuditData {
  userId: string | null;
  repoUrl: string;
  tier: string;
  estimatedTokens: number;
  healthScore: number;
  summary: string;
  issues: any[];
  totalTokens: number;
  topStrengths: any[];
  topWeaknesses: any[];
  riskLevel: string | null;
  productionReady: boolean | null;
  categoryAssessments: any;
  seniorDeveloperAssessment: any;
  suspiciousFiles: any[];
  overallVerdict: string | null;
}

export class AuditRepository {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async fetchTierPrompt(tier: string): Promise<string> {
    const { data: promptData, error: promptError } = await this.supabase
      .from('system_prompts')
      .select('prompt')
      .eq('tier', tier)
      .eq('is_active', true)
      .maybeSingle();

    if (promptError || !promptData) {
      throw new Error(`Failed to load prompt for tier: ${tier}`);
    }

    return promptData.prompt;
  }

  async saveAudit(auditData: AuditData): Promise<void> {
    // Map internal "issues" specific format to general DB format
    const dbIssues = auditData.issues.map((issue: any, index: number) => ({
      id: issue.id || `issue-${index}`,
      title: issue.title,
      description: issue.description,
      category: issue.category || 'Security',
      severity: issue.severity || 'warning',
      filePath: issue.file || 'Repository-wide',
      lineNumber: issue.line || 0,
      badCode: issue.badCode || '',
      fixedCode: issue.fixedCode || '',
      cwe: issue.cwe
    }));

    console.log(`📊 Saving ${dbIssues.length} issues to DB:`, dbIssues.slice(0, 2));

    // NORMALIZE LLM OUTPUT (Phase 3)
    // Normalize data before saving to DB and returning to frontend
    const normalizedTopStrengths = normalizeStrengthsOrIssues(auditData.topStrengths);
    const normalizedTopWeaknesses = normalizeStrengthsOrIssues(auditData.topWeaknesses);
    const normalizedRiskLevel = normalizeRiskLevel(auditData.riskLevel);

    const { error: insertError } = await this.supabase.from('audits').insert({
      user_id: auditData.userId,
      repo_url: auditData.repoUrl,
      tier: auditData.tier,
      estimated_tokens: auditData.estimatedTokens,
      health_score: auditData.healthScore,
      summary: auditData.summary,
      issues: dbIssues,
      total_tokens: auditData.totalTokens,
      extra_data: {
        topStrengths: normalizedTopStrengths,
        topWeaknesses: normalizedTopWeaknesses,
        riskLevel: normalizedRiskLevel,
        productionReady: auditData.productionReady,
        categoryAssessments: auditData.categoryAssessments,
        seniorDeveloperAssessment: auditData.seniorDeveloperAssessment,
        suspiciousFiles: auditData.suspiciousFiles,
        overallVerdict: auditData.overallVerdict,
      }
    });

    if (insertError) {
      console.error('Failed to save audit:', insertError);
      throw insertError;
    } else {
      console.log('✅ Audit saved to DB with', dbIssues.length, 'issues');
    }
  }

  getNormalizedAuditResponse(auditData: AuditData) {
    // Map internal "issues" specific format to general DB format
    const dbIssues = auditData.issues.map((issue: any, index: number) => ({
      id: issue.id || `issue-${index}`,
      title: issue.title,
      description: issue.description,
      category: issue.category || 'Security',
      severity: issue.severity || 'warning',
      filePath: issue.file || 'Repository-wide',
      lineNumber: issue.line || 0,
      badCode: issue.badCode || '',
      fixedCode: issue.fixedCode || '',
      cwe: issue.cwe
    }));

    // NORMALIZE LLM OUTPUT (Phase 3)
    const normalizedTopStrengths = normalizeStrengthsOrIssues(auditData.topStrengths);
    const normalizedTopWeaknesses = normalizeStrengthsOrIssues(auditData.topWeaknesses);
    const normalizedRiskLevel = normalizeRiskLevel(auditData.riskLevel);

    return {
      healthScore: auditData.healthScore,
      summary: auditData.summary,
      issues: dbIssues,
      riskLevel: normalizedRiskLevel,
      productionReady: auditData.productionReady,
      topStrengths: normalizedTopStrengths,
      topIssues: normalizedTopWeaknesses, // Already normalized
      suspiciousFiles: auditData.suspiciousFiles,
      categoryAssessments: auditData.categoryAssessments,
      seniorDeveloperAssessment: auditData.seniorDeveloperAssessment,
      overallVerdict: auditData.overallVerdict,
    };
  }
}
