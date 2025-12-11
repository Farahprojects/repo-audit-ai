/**
 * Context Builder
 * 
 * Builds and manages context for each reasoning loop iteration.
 * Handles compression of old steps to stay within token limits.
 */

import { Task, ReasoningStep, ToolDescription, CompressedContext } from '../core/types.ts';
import { getTokenChunker } from './token-chunker.ts';

export interface ContextBuilderConfig {
    maxContextTokens: number;
    maxRecentSteps: number;
    compressionThreshold: number;  // Start compressing after this many steps
}

const DEFAULT_CONFIG: ContextBuilderConfig = {
    maxContextTokens: 8000,
    maxRecentSteps: 5,
    compressionThreshold: 10
};

export class ContextBuilder {
    private config: ContextBuilderConfig;
    private chunker = getTokenChunker();

    constructor(config?: Partial<ContextBuilderConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Build context for the current reasoning step
     */
    build(
        task: Task,
        history: ReasoningStep[],
        tools: ToolDescription[]
    ): string {
        const parts: string[] = [];

        // 1. Task description
        parts.push(`## Task\n${task.description}\n`);

        // 2. Available tools
        const toolList = tools.map(t =>
            `- **${t.name}** [${t.requiredPermission}]: ${t.description}`
        ).join('\n');
        parts.push(`## Available Tools\n${toolList}\n`);

        // 3. Context from history
        if (history.length > 0) {
            const contextSection = this.buildHistoryContext(history);
            parts.push(contextSection);
        }

        // 4. Task-specific context
        if (task.context) {
            const taskContext = JSON.stringify(task.context, null, 2);
            parts.push(`## Task Context\n\`\`\`json\n${taskContext}\n\`\`\`\n`);
        }

        return parts.join('\n');
    }

    /**
     * Build context section from history
     */
    private buildHistoryContext(history: ReasoningStep[]): string {
        const parts: string[] = ['## Progress So Far\n'];

        if (history.length <= this.config.compressionThreshold) {
            // Show all steps in detail
            for (const step of history) {
                parts.push(this.formatStep(step));
            }
        } else {
            // Compress older steps, show recent in detail
            const olderSteps = history.slice(0, -this.config.maxRecentSteps);
            const recentSteps = history.slice(-this.config.maxRecentSteps);

            // Summarize older steps
            const summary = this.summarizeSteps(olderSteps);
            parts.push(`### Summary of Previous Steps (1-${olderSteps.length})\n${summary}\n`);

            // Show recent steps in detail
            parts.push(`### Recent Steps\n`);
            for (const step of recentSteps) {
                parts.push(this.formatStep(step));
            }
        }

        return parts.join('\n');
    }

    /**
     * Format a single step for context
     */
    private formatStep(step: ReasoningStep): string {
        const parts = [`**Step ${step.stepNumber}:**`];

        // Truncate reasoning if too long
        const reasoning = step.reasoning.length > 500
            ? step.reasoning.slice(0, 500) + '...'
            : step.reasoning;
        parts.push(`<thinking>${reasoning}</thinking>`);

        if (step.toolCalled) {
            parts.push(`Tool: ${step.toolCalled}`);

            // Summarize tool output
            if (step.toolOutput) {
                const outputSummary = this.summarizeToolOutput(step.toolOutput);
                parts.push(`Result: ${outputSummary}`);
            }
        }

        return parts.join('\n') + '\n';
    }

    /**
     * Summarize a list of steps
     */
    summarizeSteps(steps: ReasoningStep[]): string {
        if (steps.length === 0) return 'No previous steps.';

        const toolsUsed = Array.from(new Set(steps.filter(s => s.toolCalled).map(s => s.toolCalled!)));
        const successfulTools = steps.filter(s => s.toolCalled && s.toolOutput).length;

        const summary = [
            `Completed ${steps.length} reasoning steps.`,
            toolsUsed.length > 0 ? `Used tools: ${toolsUsed.join(', ')}` : 'No tools used.',
            `${successfulTools} successful tool executions.`
        ];

        // Extract key decisions from reasoning
        const keyDecisions = steps
            .filter(s => s.reasoning.length > 100)
            .map(s => {
                // Try to extract the first sentence or key phrase
                const firstSentence = s.reasoning.match(/^[^.!?]+[.!?]/);
                return firstSentence ? firstSentence[0] : s.reasoning.slice(0, 80) + '...';
            })
            .slice(-3);  // Last 3 decisions

        if (keyDecisions.length > 0) {
            summary.push(`Key decisions: ${keyDecisions.join(' → ')}`);
        }

        return summary.join(' ');
    }

    /**
     * Summarize tool output for context
     */
    private summarizeToolOutput(output: unknown): string {
        if (output === null || output === undefined) {
            return 'null';
        }

        if (typeof output === 'string') {
            return output.length > 200 ? output.slice(0, 200) + '...' : output;
        }

        if (typeof output === 'object') {
            const obj = output as Record<string, unknown>;

            // Handle common patterns
        if ('success' in obj) {
            const success = obj['success'] ? '✓' : '✗';
            if ('error' in obj) {
                return `${success} Error: ${obj['error']}`;
            }
            if ('data' in obj && typeof obj['data'] === 'object' && obj['data'] !== null) {
                const data = obj['data'] as Record<string, unknown>;
                const keys = Object.keys(data).slice(0, 3).join(', ');
                return `${success} Data with keys: ${keys}`;
            }
            return `${success}`;
            }

            // Generic object summary
            const keys = Object.keys(obj);
            if (keys.length <= 3) {
                return JSON.stringify(obj);
            }
            return `{${keys.slice(0, 3).join(', ')}... (${keys.length} keys)}`;
        }

        return String(output);
    }

    /**
     * Build compressed context for long conversations
     */
    compress(steps: ReasoningStep[]): CompressedContext {
        const toolsUsed = Array.from(new Set(steps.filter(s => s.toolCalled).map(s => s.toolCalled!)));
        const recentSteps = steps.slice(-this.config.maxRecentSteps);

        // Extract key facts
        const keyFacts: string[] = [];

        for (const step of steps) {
            // Look for explicit statements
            const factMatches = step.reasoning.match(/(?:I found that|I discovered|Key finding:|Important:)[^.]+\./gi);
            if (factMatches) {
                keyFacts.push(...factMatches.slice(0, 2));
            }
        }

        return {
            summary: this.summarizeSteps(steps),
            keyFacts: keyFacts.slice(0, 5),
            recentSteps,
            toolsUsed
        };
    }

    /**
     * Get current token estimate for context
     */
    estimateContextTokens(
        task: Task,
        history: ReasoningStep[],
        tools: ToolDescription[]
    ): number {
        const context = this.build(task, history, tools);
        return this.chunker.estimateTokens(context);
    }

    /**
     * Check if context needs compression
     */
    needsCompression(
        task: Task,
        history: ReasoningStep[],
        tools: ToolDescription[]
    ): boolean {
        const tokens = this.estimateContextTokens(task, history, tools);
        return tokens > this.config.maxContextTokens;
    }
}

// Factory function
export function createContextBuilder(config?: Partial<ContextBuilderConfig>): ContextBuilder {
    return new ContextBuilder(config);
}
