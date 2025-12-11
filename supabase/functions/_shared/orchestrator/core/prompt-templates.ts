/**
 * Prompt Templates for Universal Orchestrator
 * 
 * These prompts force step-by-step reasoning from ANY LLM model.
 * The reasoning is architectural, not model-dependent.
 */

import { ToolDescription, ReasoningStep, Task, CompressedContext } from './types.ts';

// ============================================================================
// Core System Prompt
// ============================================================================

export function buildSystemPrompt(
    task: Task,
    tools: ToolDescription[],
    context?: CompressedContext
): string {
    const toolList = tools.map(t =>
        `- ${t.name}: ${t.description} [requires: ${t.requiredPermission}]`
    ).join('\n');

    const contextSection = context ? `
Previous Context Summary:
${context.summary}

Key Facts:
${context.keyFacts.map(f => `- ${f}`).join('\n')}

Tools Used So Far: ${context.toolsUsed.join(', ') || 'None'}
` : '';

    return `You are a Universal Orchestrator that must think step-by-step out loud before taking any action.

## Your Process

Before calling any tool, you MUST:
1. STATE what you're trying to accomplish in this step
2. EXPLAIN why this tool/approach makes sense
3. DESCRIBE what you expect to learn or achieve
4. Then output your tool call

After receiving tool output, you MUST:
1. SUMMARIZE what you learned from the output
2. EXPLAIN how this affects your understanding
3. DECIDE the logical next step

## Output Format

Always structure your response as:

<thinking>
[Your step-by-step reasoning here. Be explicit about your thought process.]
</thinking>

<tool_call>
{"name": "tool_name", "input": {...}}
</tool_call>

OR if the task is complete:

<thinking>
[Your final reasoning about why the task is complete]
</thinking>

<complete>
{"result": "your final output or summary"}
</complete>

DO NOT wrap your XML output in markdown code blocks (like \`\`\`xml). Output the raw XML tags directly.

## Current Task
${task.description}

## Available Tools
${toolList}
${contextSection}
## Important Rules
1. NEVER skip the <thinking> section - it's required for every response
2. Call only ONE tool per response (unless in parallel batch mode)
3. If a tool fails, reason about alternatives before giving up
4. Be concise in your reasoning but complete in your logic
5. If you don't have enough information, use a tool to get it - don't guess

Begin by reasoning about the first step needed to complete the task.`;
}

// ============================================================================
// Step Continuation Prompt
// ============================================================================

export function buildContinuationPrompt(
    task: Task,
    previousStep: ReasoningStep,
    toolOutput: unknown
): string {
    const toolSection = previousStep.toolCalled ? `
<tool_call>
{"name": "${previousStep.toolCalled}", "input": ${JSON.stringify(previousStep.toolInput)}}
</tool_call>

## Tool Output
\`\`\`json
${JSON.stringify(toolOutput, null, 2)}
\`\`\`
` : `
(No tool was called in the previous step)

CRITICAL: You must now either CALL A TOOL to make progress or MARK COMPLETE if you are done. Do not output only thinking.
`;

    return `## Previous Step
<thinking>
${previousStep.reasoning.trim()}
</thinking>

${toolSection}

Now analyze the situation and decide the next step toward completing the task:
"${task.description}"

Remember to:
1. Summarize what you learned (or why you didn't call a tool)
2. Explain how this affects your approach
3. Decide and execute the next step (or mark complete if done)`;
}

// ============================================================================
// Error Recovery Prompt
// ============================================================================

export function buildErrorRecoveryPrompt(
    task: Task,
    failedStep: ReasoningStep,
    error: string,
    attemptNumber: number
): string {
    return `## Error Occurred

The previous tool call failed:
- Tool: ${failedStep.toolCalled}
- Input: ${JSON.stringify(failedStep.toolInput)}
- Error: ${error}
- Attempt: ${attemptNumber}

Your previous reasoning was:
<thinking>
${failedStep.reasoning}
</thinking>

## Recovery Task
You need to recover from this error and continue toward the goal:
"${task.description}"

Consider:
1. Is there an alternative tool that could achieve the same goal?
2. Is the input malformed and needs to be corrected?
3. Should you gather more information first?
4. Is this a blocking error that requires human intervention?

Reason through your recovery strategy and either:
- Try an alternative approach
- Request human intervention with <human_needed>{"question": "..."}}</human_needed>
- Mark as failed with <failed>{"reason": "..."}}</failed>`;
}

// ============================================================================
// Context Compression Prompt
// ============================================================================

export function buildContextCompressionPrompt(
    steps: ReasoningStep[],
    maxSummaryLength: number = 500
): string {
    const stepsText = steps.map((s, i) => `
Step ${i + 1}:
<thinking>${s.reasoning}</thinking>
${s.toolCalled ? `Tool: ${s.toolCalled} → ${JSON.stringify(s.toolOutput).slice(0, 200)}...` : 'No tool called'}
`).join('\n');

    return `## Context Compression Task

You have ${steps.length} reasoning steps to compress into a summary.
Maximum summary length: ${maxSummaryLength} characters.

## Steps to Compress
${stepsText}

## Output Format
Produce a JSON object:
{
  "summary": "Brief narrative of what was accomplished and learned",
  "keyFacts": ["fact1", "fact2", "..."],
  "toolsUsed": ["tool1", "tool2"]
}

Focus on:
- Key decisions made and why
- Important discoveries or data gathered
- Current state of the task
- Any blockers or concerns identified`;
}

// ============================================================================
// Parallel Batch Prompt
// ============================================================================

export function buildParallelBatchPrompt(
    task: Task,
    tools: ToolDescription[],
    maxConcurrency: number
): string {
    const toolList = tools.map(t =>
        `- ${t.name}: ${t.description}`
    ).join('\n');

    return `## Parallel Batch Mode

You may execute up to ${maxConcurrency} tools simultaneously if they are independent.

## Available Tools
${toolList}

## Task
${task.description}

## Output Format for Parallel Execution
<thinking>
[Explain why these tools can run in parallel - they must be independent]
</thinking>

<batch_call>
{
  "tools": [
    {"name": "tool1", "input": {...}, "priority": 1},
    {"name": "tool2", "input": {...}, "priority": 1}
  ],
  "executionMode": "parallel"
}
</batch_call>

Rules:
- Only batch tools that don't depend on each other's output
- Use priority to order sequential dependencies (1 = first)
- After batch results, you'll receive all outputs together`;
}

// ============================================================================
// Response Parsing Utilities
// ============================================================================

export interface ParsedResponse {
    thinking: string;
    toolCall?: {
        name: string;
        input: unknown;
    };
    batchCall?: {
        tools: Array<{ name: string; input: unknown; priority: number }>;
        executionMode: 'parallel' | 'sequential' | 'conditional';
    };
    isComplete: boolean;
    finalOutput?: unknown;
    humanNeeded?: { question: string; options?: string[] };
    isFailed?: boolean;
    failureReason?: string;
}

export function parseOrchestratorResponse(response: string): ParsedResponse {
    console.log('[Orchestrator] Parsing response length:', response?.length);

    const result: ParsedResponse = {
        thinking: '',
        isComplete: false
    };

    // 1. Extract thinking
    const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
        result.thinking = thinkingMatch[1].trim();
    } else {
        // Fallback: Treat text outside of known tags as thinking
        let residue = response;
        residue = residue.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');
        residue = residue.replace(/<batch_call>[\s\S]*?<\/batch_call>/g, '');
        residue = residue.replace(/<complete>[\s\S]*?<\/complete>/g, '');
        residue = residue.replace(/<human_needed>[\s\S]*?<\/human_needed>/g, '');
        residue = residue.replace(/<failed>[\s\S]*?<\/failed>/g, '');

        // Strip out code block markers if they wrapped the whole response
        residue = residue.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '');

        if (residue.trim()) {
            result.thinking = residue.trim();
        }
    }

    // Extract tool call
    const toolCallMatch = response.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (toolCallMatch) {
        let cleanJson = toolCallMatch[1].trim();
        // Remove markdown code blocks if present inside the tag
        cleanJson = cleanJson.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();

        try {
            result.toolCall = JSON.parse(cleanJson);
        } catch (e) {
            console.warn('[Orchestrator] Failed to parse tool_call JSON:', cleanJson, e);
            result.thinking += `\n[SYSTEM NOTE: The model attempted to call a tool but the JSON was invalid. Raw content: ${cleanJson}]`;
        }
    }



    // Extract batch call
    const batchCallMatch = response.match(/<batch_call>([\s\S]*?)<\/batch_call>/);
    if (batchCallMatch) {
        try {
            result.batchCall = JSON.parse(batchCallMatch[1].trim());
        } catch (e) {
            console.warn('[Orchestrator] Failed to parse batch_call:', e);
        }
    }

    // Extract completion
    const completeMatch = response.match(/<complete>([\s\S]*?)<\/complete>/);
    if (completeMatch) {
        result.isComplete = true;
        try {
            result.finalOutput = JSON.parse(completeMatch[1].trim());
        } catch (e) {
            result.finalOutput = completeMatch[1].trim();
        }
    }

    // Extract human intervention request
    const humanMatch = response.match(/<human_needed>([\s\S]*?)<\/human_needed>/);
    if (humanMatch) {
        try {
            result.humanNeeded = JSON.parse(humanMatch[1].trim());
        } catch (e) {
            console.warn('[Orchestrator] Failed to parse human_needed:', e);
        }
    }

    // Extract failure
    const failedMatch = response.match(/<failed>([\s\S]*?)<\/failed>/);
    if (failedMatch) {
        result.isFailed = true;
        try {
            const failData = JSON.parse(failedMatch[1].trim());
            result.failureReason = failData.reason;
        } catch (e) {
            result.failureReason = failedMatch[1].trim();
        }
    }

    // FINAL FALLBACK: If we still have no thinking, no tool call, and no completion,
    // explicitly capture the raw response as 'thinking' so the model sees what it did wrong.
    if (!result.thinking && !result.toolCall && !result.isComplete && !result.batchCall && !result.isFailed) {
        result.thinking = `[SYSTEM NOTE: The previous response was unparseable. It contained no <thinking> tags and no valid tool calls. Raw response length: ${response.length}. First 100 chars: ${response.slice(0, 100)}...]`;
    }

    return result;
}
