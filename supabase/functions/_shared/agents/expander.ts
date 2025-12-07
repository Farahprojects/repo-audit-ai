
import { AuditContext, ScanResult, ArchitectureMap } from './types.ts';
import { callGemini, GeminiUsage, fetchFileContent } from './utils.ts';

const SYSTEM_PROMPT = `You are the EXPANDER agent (Pass 2/5).
Job: Build ARCHITECTURE MAP (API Routes, DB Schema, Auth).
Return JSON only.`;

export async function runExpander(context: AuditContext, scanResult: ScanResult, apiKey: string, tierPrompt: string, targetFiles: string[]): Promise<{ result: ArchitectureMap; usage: GeminiUsage }> {
  console.log('Running Pass 2: Expander (Targeted Mode)...');

  // Strategy: Use Planner targets
  let relevantFiles = context.files.filter(f => targetFiles.includes(f.path));

  if (relevantFiles.length === 0) {
    console.warn('Planner returned 0 targets for Expander, falling back.');
    relevantFiles = context.files.filter(f => f.path.includes('schema') || f.path.includes('api')).slice(0, 5);
  }

  console.log(`Expander fetching ${relevantFiles.length} targeted files...`);

  const fetched = await Promise.all(relevantFiles.map(async f => {
    if (!f.url) return null;
    const content = await fetchFileContent(f.url);
    return `--- ${f.path} ---\n${content}`;
  }));

  const fileContext = fetched.filter(Boolean).join('\n\n');
  const userPrompt = `Project Type: ${scanResult.projectType}
Context from Pass 1: ${JSON.stringify(scanResult.fileMap)}

Review Focus:
${tierPrompt}

Analyze these Key Files for Architecture:
${fileContext}`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.2);
  return { result: data, usage };
}
