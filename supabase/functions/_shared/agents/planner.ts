import { AuditContext, SwarmPlan, WorkerTask } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.
Your job is to read the Client's Audit Goal and the File Map.
Then, you must BREAK DOWN the goal into specific tasks for your workers.

CRITICAL REQUIREMENTS:
- You have 3-5 WORKERS available. Create EXACTLY the number of tasks that matches available workers.
- DISTRIBUTE FILES EVENLY across all workers. Each worker should get roughly the same number of files.
- ANALYZE the Audit Goal to extract specific CHECKLIST ITEMS and RULES that workers must follow.
- For each task, provide a DETAILED INSTRUCTION that includes the specific checklist items/rules from the Audit Goal.
- Assign a specialized ROLE to each task based on the audit focus areas.
- Assign specific FILES to each task from the provided File Map. Max 20 files per task.
- IMPORTANT: You can ONLY assign files that are listed in the File Map. Do NOT invent or guess file paths.
- Each worker gets a comprehensive task description with actionable steps.

PLANNING STEPS:
1. Count total files and divide evenly among 3-5 workers
2. Extract key checklist items/rules from the Audit Goal
3. Group related files by functionality/type
4. Assign specialized roles based on file groupings
5. Write detailed instructions incorporating the extracted rules/checklist

Return JSON:
{
  "focusArea": "Executive summary of the plan...",
  "tasks": [
    {
      "id": "task_1",
      "role": "Security Specialist",
      "instruction": "Follow these specific rules from the audit goal: [list extracted rules]. Check these files for: [specific checklist items]. Focus on: [detailed requirements].",
      "targetFiles": ["file1.js", "file2.ts", "file3.sql"]
    }
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

  const fileList = context.files.map(f => f.path).join('\n');
  const userPrompt = `PROJECT OVERVIEW:
- Total files: ${context.files.length}
- Worker capacity: 3-5 parallel workers available
- File distribution: Distribute files EVENLY across workers

PROJECT FILE MAP (ONLY use these files - do not invent any others):
${fileList}

CLIENT AUDIT GOAL & REQUIREMENTS:
${tierPrompt}

PLANNING REQUIREMENTS:
1. Extract the specific checklist items, rules, and focus areas from the Audit Goal above
2. Create 3-5 tasks (one per worker) with EVEN file distribution
3. Each task must include the extracted rules/checklist items in its instruction
4. Group related files logically by functionality (auth, database, frontend, etc.)
5. Provide detailed, actionable instructions for each worker

Create a comprehensive task breakdown that ensures complete audit coverage with no gaps or overlaps.`;

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

  // LOG PLANNING RESULTS
  sanitizedPlan.tasks.forEach((task, i) => {
    console.log(`   Task ${i + 1} [${task.role}]: ${task.targetFiles?.length || 0} files`);
  });
  const totalAssigned = sanitizedPlan.tasks.reduce((sum, t) => sum + (t.targetFiles?.length || 0), 0);

  return { result: sanitizedPlan, usage };
}
