import { AuditContext, ScanResult } from './types.ts';
import { callGemini, GeminiUsage, fetchFileContent } from './utils.ts';

const SYSTEM_PROMPT = `You are the SCANNER agent (Pass 1 / 5).
Your job is to map the project structure based on critical files.
Output structured JSON: { fileMap, projectType, frameworks, dependencies } `;

export async function runScanner(context: AuditContext, apiKey: string, tierPrompt: string, targetFiles: string[]): Promise<{ result: ScanResult; usage: GeminiUsage }> {
  console.log('Running Pass 1: Scanner (Targeted Mode)...');

  // Strategy: Use Planner targets + fallback to config
  let filesToFetch = context.files.filter(f => targetFiles.includes(f.path));

  // Fallback safety (if Planner failed to select anything)
  if (filesToFetch.length === 0) {
    console.warn('Planner returned 0 targets for Scanner, falling back to heuristics.');
    filesToFetch = context.files.filter(f =>
      f.path.includes('package.json') || f.path.endsWith('main.ts')
    ).slice(0, 5);
  }

  console.log(`Scanner fetching ${filesToFetch.length} targeted files...`);

  // Parallel Fetch
  const fetched = await Promise.all(filesToFetch.map(async f => {
    if (!f.url) return null;
    const content = await fetchFileContent(f.url);
    return `--- ${f.path} ---\n${content.slice(0, 5000)}`;
  }));

  const fileContext = fetched.filter(Boolean).join('\n\n');

  // Provide the FULL map (paths only) + Content of critical files
  const mapOverview = context.files.map(f => f.path).join('\n');

  const userPrompt = `Here is the Full File List:
${mapOverview}

Here is the Content of Critical Files:
${fileContext}

Identify project type, dependencies, and core structure.
  ${tierPrompt} `;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1);
  return { result: data, usage };
}
