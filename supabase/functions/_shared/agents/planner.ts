import { AuditContext, SwarmPlan, WorkerTask } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.

You receive repository file groupings and audit rules.
Create 3-5 tasks that cover different aspects of the codebase.
All workers get the same audit rules - they just focus on different file groups.

Return ONLY JSON:
{
  "focusArea": "Brief summary of the audit plan...",
  "tasks": [
    {
      "id": "task_1",
      "role": "Worker 1",
      "instruction": "Follow the audit rules for these file groups",
      "targetFiles": ["src/**", "*.ts"]
    }
  ]
}`;

// Expand glob patterns to actual file paths
function expandFilePatterns(patterns: string[], validFiles: Set<string>): string[] {
  const expanded: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Glob pattern - convert to regex and match against valid files
      // ** matches any number of directories, * matches within directory
      const regexPattern = '^' +
        pattern
          .replace(/\*\*/g, '.*')  // ** becomes .*
          .replace(/\*/g, '[^/]*') // * becomes [^/]*
          .replace(/\?/g, '[^/]')  // ? becomes [^/] (single char)
        + '$';

      const regex = new RegExp(regexPattern);

      for (const file of validFiles) {
        if (regex.test(file)) {
          expanded.push(file);
        }
      }
    } else {
      // Exact path
      if (validFiles.has(pattern)) {
        expanded.push(pattern);
      }
    }
  }

  return expanded;
}

// Validate and expand tasks - convert glob patterns to actual file paths
function sanitizeSwarmPlan(plan: SwarmPlan, validFiles: Set<string>): SwarmPlan {
  const sanitizedTasks: WorkerTask[] = [];

  for (const task of plan.tasks) {
    const patterns = task.targetFiles || [];

    // Expand glob patterns to actual file paths
    const expandedFiles = expandFilePatterns(patterns, validFiles);

    console.log(`📋 Task [${task.role}]: Expanded ${patterns.length} patterns to ${expandedFiles.length} files`);

    // Only include task if it has at least one file after expansion
    if (expandedFiles.length > 0) {
      sanitizedTasks.push({
        ...task,
        targetFiles: expandedFiles
      });
    } else {
      console.warn(`🚫 Task [${task.role}] removed - no files matched patterns: ${patterns.join(', ')}`);
    }
  }

  return {
    ...plan,
    tasks: sanitizedTasks
  };
}

export async function runPlanner(context: AuditContext, apiKey: string, tierPrompt: string): Promise<{ result: SwarmPlan; usage: GeminiUsage }> {
  console.log('Running Pass 0: Planner (Swarm CEO)...');

  // Use grouped file summaries for better LLM understanding
  const fileGroups = context.preflight?.fileGroups || [];
  const userPrompt = `Repository Overview:
${fileGroups.join('\n')}

Audit rules:
${tierPrompt}

Create 3-5 tasks covering these file groups. All tasks use the same audit rules above.`;

  const { data, usage } = await callGemini(apiKey, SYSTEM_PROMPT, userPrompt, 0.1, { role: 'CEO' });

  // Fallback
  if (!data.tasks || !Array.isArray(data.tasks)) {
    data.tasks = [];
    console.warn("Planner returned no tasks!");
  }

  // SECURITY: Validate and sanitize the plan (using empty set since we work with groups now)
  const validFiles = new Set(context.files.map(f => f.path));
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
