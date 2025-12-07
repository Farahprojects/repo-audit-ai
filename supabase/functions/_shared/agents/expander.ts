
import { AuditContext, ScanResult, ArchitectureMap } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the EXPANDER agent (Pass 2/5).
Your job is to build an ARCHITECTURE MAP from the code.
Identify: API Routes, Database Schemas, Auth Guards, and Data Flows.

Refine the structural understanding from Pass 1.
Return JSON:
{
  "apiRoutes": ["GET /api/users", "POST /auth/login"],
  "databaseSchema": [{"table": "users", "columns": ["id", "email"]}], // Summarized
  "authGuards": ["requireAuth", "supabase.auth.getUser"],
  "externalServices": ["Stripe", "OpenAI"],
  "dataFlows": [
    {"source": "API Input", "sink": "DB", "data": "User Profile"}
  ]
}`;

export async function runExpander(context: AuditContext, scanResult: ScanResult, apiKey: string, tierPrompt: string): Promise<{ result: ArchitectureMap; usage: GeminiUsage }> {
  console.log('Running Pass 2: Expander...');

  // Strategy: We need to see code to find routes/schema.
  // We prioritize: Schema definitions, API routes/functions, Auth middleware.
  const relevantFiles = context.files.filter(f =>
    f.path.includes('schema') ||
    f.path.includes('migration') ||
    f.path.includes('api') ||
    f.path.includes('function') ||
    f.path.includes('service') ||
    f.path.endsWith('.sql')
  );

  const fileContext = relevantFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const userPrompt = `Project Type: ${scanResult.projectType}
Context from Pass 1: ${JSON.stringify(scanResult.fileMap)}

Review Focus:
${tierPrompt}

Analyze these Key Files for Architecture:
${fileContext}`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2);
  return { result: data, usage };
}
```
