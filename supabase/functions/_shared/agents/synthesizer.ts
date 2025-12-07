
import { AuditContext, RiskAssessment, FinalAuditReport } from './types.ts';
import { callGemini } from './utils.ts';

const SYSTEM_PROMPT = `You are the SYNTHESIZER agent (Pass 5/5).
Your job is to write the FINAL AUDIT REPORT.
You are a Senior Principal Engineer.

Inputs:
- Risk Assessment (Pass 4)

Output Requirements:
- "healthScore": 0-100 (Weighted average of security, performance, maintainability)
- "summary": Executive summary.
- "topStrengths": 3-5 key good things.
- "topWeaknesses": 3-5 key bad things.
- "issues": The filtered, high-confidence list of findings.
- "riskLevel": Overall risk.
- "productionReady": boolean.

Return JSON.`;

export async function runSynthesizer(context: AuditContext, risks: RiskAssessment, apiKey: string, tierPrompt: string): Promise<FinalAuditReport> {
    console.log('Running Pass 5: Synthesizer...');

    const userPrompt = `Risk Assessment (Pass 4):
${JSON.stringify(risks, null, 2)}

Repo: ${context.repoUrl}

Review Focus:
${tierPrompt}

Generate the final Senior Principal Engineer Report.
Prioritize findings. Filter out noise.
`;

    return await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2);
}
