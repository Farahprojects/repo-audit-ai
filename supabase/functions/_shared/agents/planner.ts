import { AuditContext, SwarmPlan } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.
Your job is to read the Client's Audit Goal and the File Map.
Then, you must BREAK DOWN the goal into specific tasks for your workers.

INSTRUCTIONS:
- Analyze the "Audit Goal" carefully.
- Create 3-5 distinct TASKS to cover the goal.
- Assign a specialized ROLE to each task (e.g. "Auth Auditor", "Database Analyst", "Frontend Reviewer").
- Assign specific FILES to each task. Max 20 files per task.
- Write a clear INSTRUCTION for each task.

Return JSON:
{
  "focusArea": "Executive summary of the plan...",
  "tasks": [
    {
      "id": "task_1",
      "role": "Auth Specialist",
      "instruction": "Check supabase/middleware.ts and useAuth.ts for secure session handling.",
      "targetFiles": ["supabase/middleware.ts", "src/hooks/useAuth.ts"]
    },
    ...
  ]
}`;

export async function runPlanner(context: AuditContext, apiKey: string, tierPrompt: string): Promise<{ result: SwarmPlan; usage: GeminiUsage }> {
  console.log('Running Pass 0: Planner (Swarm CEO)...');

  const fileList = context.files.map(f => f.path).join('\n');
  const userPrompt = `Project File Map:
${fileList}

Client Audit Goal:
${tierPrompt}

Create a distinct task list to execute this audit.`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1, { role: 'CEO' });

  // Fallback
  if (!data.tasks || !Array.isArray(data.tasks)) {
    data.tasks = [];
    console.warn("Planner returned no tasks!");
  }

  return { result: data, usage };
}
