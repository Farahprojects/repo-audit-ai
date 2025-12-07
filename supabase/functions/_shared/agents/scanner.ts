
import { AuditContext, ScanResult } from './types.ts';
import { callGemini } from './utils.ts';

const SYSTEM_PROMPT = `You are the SCANNER agent (Pass 1/5) in a code audit pipeline.
Your job is to read the raw file list and extract structural metadata.
Do NOT look for bugs yet. Look for: frameworks, identifying patterns, config files, and project type.

Return JSON:
{
  "projectType": "e.g. Next.js, React, Node API, etc",
  "frameworks": ["list", "of", "major", "libs"],
  "dependencies": {"pkg": "version"},
  "configFiles": ["list", "of", "config", "files"],
  "fileMap": {
    "src/components": "UI components",
    "supabase/functions": "Edge functions",
    ...describe major directories...
  },
  "metadata": {
    "totalFiles": <number>,
    "totalTokens": <number>
  }
}`;

export async function runScanner(context: AuditContext, apiKey: string, tierPrompt: string): Promise<ScanResult> {
  console.log('Running Pass 1: Scanner...');

  // Prepare light context (filenames only + key configs)
  const filePaths = context.files.map(f => f.path).join('\n');
  const configContent = context.files
    .filter(f => f.path.match(/(package\.json|tsconfig\.json|supabase\/config\.toml|\.env\.example)$/))
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  const userPrompt = `Files in Repo:\n${filePaths}\n\nKey Configs:\n${configContent}\n\nReview Focus:\n${tierPrompt}`;

  return await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1);
}
