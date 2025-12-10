import { AuditContext, SwarmPlan, WorkerTask } from './types.ts';
import { callGemini, GeminiUsage } from './utils.ts';

const SYSTEM_PROMPT = `You are the CEO / PLANNER of a Code Audit Team.
Your job is to read the Client's Audit Goal and the File Map.
Then, you must BREAK DOWN the goal into specific tasks for your workers.

CRITICAL REQUIREMENTS:
- You have 3-5 WORKERS available. Create EXACTLY the number of tasks that matches available workers.
- ANALYZE the Audit Goal to extract specific CHECKLIST ITEMS and RULES.
- **INTELLIGENT MAPPING**: You must map specific rules to the file types they apply to.
  - Do NOT assign SQL checks to frontend files.
  - Do NOT assign React/UI checks to backend files.
- For each task, provide a DETAILED INSTRUCTION that includes *only* the checklist items relevant to the assigned files.
- Assign a specialized ROLE to each task based on the audit focus areas.
- Use GLOB PATTERNS for targetFiles (e.g., "src/components/**", "*.sql") - NOT individual file lists.
- Keep targetFiles array SHORT (2-5 patterns per task).
- Each worker gets a comprehensive task description with actionable steps.

PLANNING STEPS:
1. Analyze the repository structure and file types provided
2. Extract key checklist items/rules from the Audit Goal
3. Group related functionality by file type patterns
4. Assign specialized roles based on functionality groupings
5. Filter the checklist items: Assign ONLY relevant rules to each worker based on their file patterns
6. Write detailed instructions incorporating the filtered rules

OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure. Do NOT include any explanations, file listings, or text outside the JSON:

{
  "focusArea": "Brief summary (1-2 sentences max)...",
  "tasks": [
    {
      "id": "task_1",
      "role": "Security Specialist",
      "instruction": "Check for: [specific items]. Focus on: [requirements].",
      "targetFiles": ["src/auth/**", "supabase/functions/**"]  // USE GLOB PATTERNS, NOT individual files
    }
  ]
}

CRITICAL RULES:
- Use GLOB PATTERNS (e.g., "src/components/**", "*.sql") instead of listing individual files
- Keep targetFiles array SHORT (2-5 patterns per task)
- Keep focusArea to 1-2 sentences MAX
- Total JSON output must be under 5KB`;

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
1. Extract the specific checklist items from the Audit Goal above
2. Match each checklist item to the file types it applies to (e.g. "RLS checks" -> "*.sql", "React checks" -> "*.tsx")
3. Create 3-5 tasks with EVEN file distribution
4. For each task, include ONLY the extracted rules that match the assigned files
5. Provide detailed, actionable instructions for each worker

Create a comprehensive task breakdown that ensures complete audit coverage with no gaps or overlaps.

OUTPUT: Return ONLY a valid JSON object. Do NOT include any explanations, file listings, thinking processes, or content outside the JSON structure.`;

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
