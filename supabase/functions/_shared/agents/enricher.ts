
import { AuditContext, CorrelationGraph, RiskAssessment } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the ENRICHER agent (Pass 4/5).
Your job is to take the potential issues found by the Correlator and Apply DEEP EXPERTISE.
Focus on SECURITY (OWASP Top 10) and PERFORMANCE.

For each issue:
1. Verify if it is a real risk.
2. Assign a severity (Critical, Warning, Info).
3. cite specific CWEs if security related.
4. Calculate risk scores.

Return JSON:
{
  "securityScore": <0-100>,
  "performanceScore": <0-100>,
  "maintainabilityScore": <0-100>,
  "findings": [
    {
      "id": "SEC-001",
      "category": "Security",
      "severity": "critical",
      "title": "RLS Bypass in User Update",
      "description": "The function 'update_user' runs as superuser but relies on client-side ID validation.",
      "filePath": "supabase/functions/user-profile/index.ts",
      "remediation": "Use auth.uid() in the RLS policy instead.",
      "cwe": "CWE-862"
    }
  ]
}`;

export async function runEnricher(context: AuditContext, correlation: CorrelationGraph, apiKey: string, tierPrompt: string): Promise<{ result: RiskAssessment; usage: GeminiUsage }> {
  console.log('Running Pass 4: Enricher...');

  // We feed the correlator's suspicions to the expert.
  const userPrompt = `Potential Issues Discovered (Pass 3):
${JSON.stringify(correlation.potentialIssues, null, 2)}

Repo Context:
Tier: ${context.tier}
Repo URL: ${context.repoUrl}

Review Focus:
${tierPrompt}

Verify these issues and perform a deep security/performance review.
`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2);
  return { result: data, usage };
}
