
import { AuditContext, ArchitectureMap, CorrelationGraph } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CORRELATOR agent (Pass 3/5).
Your job is to find BROKEN LINKS, INCONSISTENCIES, and LOGIC GAPS.
Use the Architecture Map from Pass 2.

Ask yourself:
- Does every API route have an Auth Guard?
- Do DB writes match the Schema?
- Are environment variables used safely?
- Are there dead files or imports?

Return JSON:
{
  "nodes": ["list of key entities"],
  "edges": [{"from": "nodeA", "to": "nodeB", "relation": "calls"}],
  "potentialIssues": [
    {
      "type": "security_gap" | "broken_link" | "logic_error",
      "description": "Route X writes to Table Y but checks no permissions",
      "files": ["/path/to/route.ts", "/path/to/schema.sql"],
      "confidence": 0.9
    }
  ]
}`;

export async function runCorrelator(context: AuditContext, archMap: ArchitectureMap, apiKey: string, tierPrompt: string): Promise<{ result: CorrelationGraph; usage: GeminiUsage }> {
  console.log('Running Pass 3: Correlator...');

  // This pass needs to look at the relationships.
  // It consumes the definition of the architecture.

  const userPrompt = `Architecture Map (from Pass 2):
${JSON.stringify(archMap, null, 2)}

Review Focus:
${tierPrompt}

Analyze for logical gaps and correlations. 
Are there missing guards? 
Are there defined services that are never used?
Are there API routes that don't map to known DB constraints?`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2);
  return { result: data, usage };
}
