import { AuditContext, SwarmPlan, WorkerTask } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.
Your job is to read the Client's Audit Goal and the File Map.
Then, you must BREAK DOWN the goal into specific tasks for your workers.

INSTRUCTIONS:
- Analyze the "Audit Goal" carefully.
- Create 3-5 distinct TASKS to cover the goal.
- Assign a specialized ROLE to each task (e.g. "Auth Auditor", "Database Analyst", "Frontend Reviewer").
- Assign specific FILES to each task from the provided File Map. Max 20 files per task.
- Write a clear INSTRUCTION for each task.
- IMPORTANT: You can ONLY assign files that are listed in the File Map. Do NOT invent or guess file paths.

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

// Validate and filter tasks to only include files that exist in the preflight
function sanitizeSwarmPlan(plan: SwarmPlan, validFiles: Set<string>): SwarmPlan {
  const sanitizedTasks: WorkerTask[] = [];
  let totalInvalidFiles = 0;

  for (const task of plan.tasks) {
    const originalCount = task.targetFiles?.length || 0;

    // Filter to only valid file paths
    const validTargetFiles = (task.targetFiles || []).filter(path => {
      if (validFiles.has(path)) {
        return true;
      }
      totalInvalidFiles++;
      return false;
    });

    // Only include task if it has at least one valid file
    if (validTargetFiles.length > 0) {
      sanitizedTasks.push({
        ...task,
        targetFiles: validTargetFiles
      });

      if (validTargetFiles.length < originalCount) {
        console.warn(`📋 Task [${task.role}] had ${originalCount - validTargetFiles.length} invalid files removed`);
      }
    } else if (originalCount > 0) {
      console.warn(`🚫 Task [${task.role}] removed entirely - ALL ${originalCount} files were invalid`);
    }
  }

  if (totalInvalidFiles > 0) {
    console.warn(`🚫 Planner attempted to assign ${totalInvalidFiles} total invalid files (removed)`);
  }

  return {
    ...plan,
    tasks: sanitizedTasks
  };
}

export async function runPlanner(context: AuditContext, apiKey: string, tierPrompt: string): Promise<{ result: SwarmPlan; usage: GeminiUsage }> {
  console.log('Running Pass 0: Planner (Swarm CEO)...');

  // Build valid file set from preflight/context (single source of truth)
  const validFiles = new Set(context.files.map(f => f.path));
  console.log(`📂 Planner has ${validFiles.size} valid files from preflight`);

  const fileList = context.files.map(f => f.path).join('\n');
  const userPrompt = `Project File Map (${context.files.length} files - ONLY use these files):
${fileList}

Client Audit Goal:
${tierPrompt}

Create a distinct task list to execute this audit. You may ONLY assign files from the File Map above.`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1, { role: 'CEO' });

  // Fallback
  if (!data.tasks || !Array.isArray(data.tasks)) {
    data.tasks = [];
    console.warn("Planner returned no tasks!");
  }

  // SECURITY: Validate and sanitize the plan to remove any hallucinated file paths
  const sanitizedPlan = sanitizeSwarmPlan(data, validFiles);

  if (sanitizedPlan.tasks.length === 0 && data.tasks.length > 0) {
    console.error(`🚨 ALL tasks were removed due to invalid file paths! Original: ${data.tasks.length} tasks`);
  }

  return { result: sanitizedPlan, usage };
}
