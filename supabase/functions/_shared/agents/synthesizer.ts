import { AuditContext, WorkerResult, FinalAuditReport } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the SYNTHESIZER agent (The Editor).
Your job is to read the findings from the Audit Swarm and compile the Final Report.
You are a Senior Principal Engineer.

Inputs:
- Swarm Findings (List of analyses from parallel workers)

Output Requirements:
- "healthScore": 0-100 (Weighted average of findings severity)
- "summary": Executive summary of the swarm's discovery.
- "topStrengths": Key good patterns found.
- "topWeaknesses": Key areas to improve.
- "issues": Consolidated list of issues. DEDUPLICATE and PRIORITIZE.
- "riskLevel": Overall risk.
- "productionReady": boolean.

Return JSON.`;

export async function runSynthesizer(context: AuditContext, swarmResults: WorkerResult[], apiKey: string, tierPrompt: string): Promise<{ result: FinalAuditReport; usage: GeminiUsage }> {
    console.log('Running Pass 5: Synthesizer (Reduce Step)...');

    const findingsText = swarmResults.map(r => `--- Finding from Task ${r.taskId} ---\n${r.findings}`).join('\n\n');

    const userPrompt = `Swarm Findings:
${findingsText}

Repo: ${context.repoUrl}

Review Focus:
${tierPrompt}

Generate the final Senior Principal Engineer Report.
Prioritize findings. Filter out noise. Deduplicate similar issues found by different workers.`;

    const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2, { role: 'SYNTHESIZER' });

    // Fallback for issues if missing (Brain might return empty sometimes)
    if (!data.issues) data.issues = [];

    return { result: data, usage };
}
