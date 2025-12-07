
import { AuditContext } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

export interface PlannerOutput {
    scannerTargets: string[]; // Files for the Scanner to fetch
    expanderTargets: string[]; // Files for the Expander to fetch
    focusArea: string; // Strategic advice for the agents
}

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.
Your job is to analyze the File Map and the User's Goal (Tier Prompt), and assign specific files for your workers to investigate.

AGENTS:
1. SCANNER: Need to see config files, entry points, and high-level structure.
2. EXPANDER: Needs to see Architecture (Schema, API Routes, Auth Middleware).

GOAL:
Minimize token usage by only selecting the most relevant files.
Max 20 files per agent.

Return JSON:
{
  "scannerTargets": ["package.json", "src/index.ts", ...],
  "expanderTargets": ["src/api/auth.ts", "supabase/schema.sql", ...],
  "focusArea": "Focus on Authentication vulnerabilities in the Next.js API routes."
}`;

export async function runPlanner(context: AuditContext, apiKey: string, tierPrompt: string): Promise<{ result: PlannerOutput; usage: GeminiUsage }> {
    console.log('Running Pass 0: Planner (CEO)...');

    const fileList = context.files.map(f => f.path).join('\n');
    const userPrompt = `Project File Map:
${fileList}

Audit Goal:
${tierPrompt}

Create a hunting plan.`;

    const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1);

    // Fallback if empty
    if (!data.scannerTargets) data.scannerTargets = [];
    if (!data.expanderTargets) data.expanderTargets = [];

    return { result: data, usage };
}
