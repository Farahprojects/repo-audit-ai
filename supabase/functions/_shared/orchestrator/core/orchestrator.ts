/**
 * Universal Orchestrator
 * 
 * Main reasoning loop that forces step-by-step thinking from any LLM.
 * This is the brain of the entire system.
 */

import {
    Task,
    OrchestratorConfig,
    OrchestratorResult,
    ReasoningStep,
    ToolResult,
    PermissionLevel,
    ToolContext,
    THINKING_BUDGETS,
    ThinkingBudgetLevel,
    ReasoningEvent
} from './types.ts';

import { ToolRegistry, createToolRegistry } from './tool-registry.ts';
import { StateManager } from './state-manager.ts';
import {
    buildSystemPrompt,
    buildContinuationPrompt,
    buildErrorRecoveryPrompt,
    parseOrchestratorResponse,
    ParsedResponse
} from './prompt-templates.ts';

// Gemini 2.5 Pro for orchestrator reasoning
const GEMINI_MODEL = 'gemini-2.5-pro';
const DEFAULT_MAX_ITERATIONS = 50;
const MAX_RETRIES_PER_STEP = 3;

export class Orchestrator {
    private config: OrchestratorConfig;
    private stateManager: StateManager;
    private toolRegistry: ToolRegistry;
    private iteration: number = 0;
    private isComplete: boolean = false;
    private isFailed: boolean = false;

    constructor(config: OrchestratorConfig, toolRegistry?: ToolRegistry) {
        this.config = {
            ...config,
            maxIterations: config.maxIterations || DEFAULT_MAX_ITERATIONS,
            permissions: config.permissions || [PermissionLevel.READ]
        };

        this.stateManager = new StateManager({ supabase: config.supabase });
        this.toolRegistry = toolRegistry || createToolRegistry();
    }

    /**
     * Execute a task through the reasoning loop
     */
    async execute(task: Task): Promise<OrchestratorResult> {
        console.log(`[Orchestrator] Starting task: ${task.description}`);

        // Create session
        const session = await this.stateManager.createSession(
            task.description,
            this.config.userId
        );

        const sessionId = session.id;

        try {
            // Run the reasoning loop
            const finalOutput = await this.reasoningLoop(task);

            // Mark complete
            await this.stateManager.updateSessionStatus('completed');

            const history = await this.stateManager.getHistory();

            return {
                success: true,
                sessionId,
                finalOutput,
                reasoningHistory: history,
                totalTokens: this.stateManager.getTotalTokens(),
                totalSteps: this.stateManager.getCurrentStep()
            };

        } catch (error) {
            console.error('[Orchestrator] Task failed:', error);

            await this.stateManager.updateSessionStatus('failed');

            const history = await this.stateManager.getHistory();

            return {
                success: false,
                sessionId,
                error: error instanceof Error ? error.message : String(error),
                reasoningHistory: history,
                totalTokens: this.stateManager.getTotalTokens(),
                totalSteps: this.stateManager.getCurrentStep()
            };
        }
    }

    /**
     * Resume from a previous session
     */
    async resume(sessionId: string, task: Task): Promise<OrchestratorResult> {
        const session = await this.stateManager.resumeSession(sessionId);

        if (!session) {
            return {
                success: false,
                sessionId,
                error: `Session not found: ${sessionId}`,
                reasoningHistory: [],
                totalTokens: 0,
                totalSteps: 0
            };
        }

        if (session.status === 'completed') {
            const history = await this.stateManager.getHistory();
            return {
                success: true,
                sessionId,
                reasoningHistory: history,
                totalTokens: session.totalTokens,
                totalSteps: session.totalSteps
            };
        }

        // Resume the reasoning loop
        return this.execute(task);
    }

    /**
     * Main reasoning loop
     * THINK → OUTPUT → DECIDE → EXECUTE → RECEIVE → INTEGRATE → EVALUATE
     */
    private async reasoningLoop(task: Task): Promise<unknown> {
        let lastStep: ReasoningStep | null = null;
        let lastToolOutput: unknown = null;

        while (!this.isComplete && !this.isFailed && this.iteration < this.config.maxIterations) {
            this.iteration++;

            console.log(`[Orchestrator] Iteration ${this.iteration}/${this.config.maxIterations}`);

            try {
                // THINK: Generate reasoning with LLM
                const response = await this.generateReasoning(task, lastStep, lastToolOutput);

                // Parse the response
                const parsed = parseOrchestratorResponse(response.text);

                // VALIDATE: Check for valid response format
                const isValidResponse = parsed.thinking || parsed.toolCall || parsed.isComplete || parsed.batchCall || parsed.isFailed;
                if (!isValidResponse) {
                    console.error('[Orchestrator] CRITICAL: Invalid response format - AI did not follow required XML structure');
                    console.error('[Orchestrator] Raw response (first 500 chars):', response.text.slice(0, 500));
                    console.error('[Orchestrator] Parsed result:', {
                        hasThinking: !!parsed.thinking,
                        hasToolCall: !!parsed.toolCall,
                        isComplete: parsed.isComplete,
                        hasBatchCall: !!parsed.batchCall,
                        isFailed: parsed.isFailed
                    });
                    // Continue loop to allow retry - the fallback parsing should have set thinking
                }

                // OUTPUT: Stream/save reasoning step
                const step = await this.saveAndStreamStep(
                    parsed,
                    response.tokenUsage
                );

                lastStep = step;

                // EVALUATE: Check if complete
                if (parsed.isComplete) {
                    console.log('[Orchestrator] Task complete');
                    this.isComplete = true;
                    return parsed.finalOutput;
                }

                // Check for failure
                if (parsed.isFailed) {
                    console.log('[Orchestrator] Task marked as failed:', parsed.failureReason);
                    this.isFailed = true;
                    throw new Error(parsed.failureReason || 'Task failed');
                }

                // Check for human intervention needed
                if (parsed.humanNeeded) {
                    console.log('[Orchestrator] Human intervention needed:', parsed.humanNeeded.question);
                    await this.stateManager.updateSessionStatus('paused');
                    // In the future, we'd wait for human input here
                    throw new Error(`Human intervention required: ${parsed.humanNeeded.question}`);
                }

                // DECIDE & EXECUTE: Call tool if needed
                if (parsed.toolCall) {
                    const toolResult = await this.executeTool(
                        parsed.toolCall.name,
                        parsed.toolCall.input,
                        task
                    );

                    lastToolOutput = toolResult;

                    // Update step with tool output
                    await this.updateStepWithToolOutput(step, toolResult);
                } else if (parsed.batchCall) {
                    // PARALLEL EXECUTION
                    const batchResults = await this.executeBatch(parsed.batchCall, task);
                    lastToolOutput = Object.fromEntries(batchResults);
                } else {
                    // No tool call and not complete - something is wrong
                    console.warn('[Orchestrator] No tool call or completion in response');
                    // Let the loop continue, the LLM might self-correct
                }

            } catch (error) {
                console.error(`[Orchestrator] Iteration ${this.iteration} failed:`, error);

                // Try to recover
                if (lastStep && this.iteration < this.config.maxIterations - 1) {
                    const recovered = await this.attemptRecovery(task, lastStep, error);
                    if (recovered) continue;
                }

                throw error;
            }
        }

        if (this.iteration >= this.config.maxIterations) {
            throw new Error(`Max iterations (${this.config.maxIterations}) exceeded`);
        }

        return null;
    }

    /**
     * Generate reasoning using LLM
     */
    private async generateReasoning(
        task: Task,
        previousStep: ReasoningStep | null,
        toolOutput: unknown
    ): Promise<{ text: string; tokenUsage: number }> {
        // Build prompt
        let prompt: string;

        if (!previousStep) {
            // Initial prompt
            const tools = this.toolRegistry.getToolList(this.config.permissions);
            prompt = buildSystemPrompt(task, tools);
        } else {
            // Continuation prompt
            prompt = buildContinuationPrompt(task, previousStep, toolOutput);
        }

        // Determine thinking budget
        const thinkingBudget = this.resolveThinkingBudget(task);

        // Call Gemini
        const response = await this.callGemini(prompt, thinkingBudget);

        return response;
    }

    /**
     * Call Gemini API
     */
    private async callGemini(
        prompt: string,
        thinkingBudget: number
    ): Promise<{ text: string; tokenUsage: number }> {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.config.apiKey
                },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: prompt }] }
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 16384
                        // Removed thinkingConfig to rely 100% on prompt-based reasoning
                        // This ensures universal compatibility across different models
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const usage = data.usageMetadata || {};

        return {
            text,
            tokenUsage: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)
        };
    }

    /**
     * Save step and stream to callback
     */
    private async saveAndStreamStep(
        parsed: ParsedResponse,
        tokenUsage: number
    ): Promise<ReasoningStep> {
        const step = await this.stateManager.saveStep({
            reasoning: parsed.thinking,
            toolCalled: parsed.toolCall?.name,
            toolInput: parsed.toolCall?.input,
            tokenUsage
        });

        // Stream to callback
        if (this.config.streamCallback) {
            await this.config.streamCallback(step);
        }

        // Also emit as event for SSE
        this.emitEvent({
            type: 'thinking',
            sessionId: this.stateManager.getSessionId(),
            stepNumber: step.stepNumber,
            data: {
                reasoning: parsed.thinking,
                toolCall: parsed.toolCall
            },
            timestamp: new Date().toISOString()
        });

        return step;
    }

    /**
     * Execute a tool
     */
    private async executeTool(name: string, input: unknown, task: Task): Promise<ToolResult> {
        console.log(`[Orchestrator] Executing tool: ${name}`);

        const context: ToolContext = {
            sessionId: this.stateManager.getSessionId(),
            userId: this.config.userId,
            permissions: this.config.permissions || [PermissionLevel.READ],
            supabase: this.config.supabase,
            preflight: task.context?.preflight
        };

        const result = await this.toolRegistry.execute(name, input, context);

        // Emit tool result event
        this.emitEvent({
            type: 'tool_result',
            sessionId: this.stateManager.getSessionId(),
            stepNumber: this.stateManager.getCurrentStep(),
            data: { toolName: name, result },
            timestamp: new Date().toISOString()
        });

        return result;
    }

    /**
     * Execute batch of tools (parallel mode)
     */
    private async executeBatch(
        batchCall: ParsedResponse['batchCall'],
        task: Task
    ): Promise<Map<string, ToolResult>> {
        if (!batchCall) return new Map();

        console.log(`[Orchestrator] Executing batch: ${batchCall.tools.length} tools`);

        const context: ToolContext = {
            sessionId: this.stateManager.getSessionId(),
            userId: this.config.userId,
            permissions: this.config.permissions || [PermissionLevel.READ],
            supabase: this.config.supabase,
            preflight: task.context?.preflight
        };

        return this.toolRegistry.executeParallel(batchCall.tools, context);
    }

    /**
     * Update step with tool output
     */
    private async updateStepWithToolOutput(
        step: ReasoningStep,
        toolResult: ToolResult
    ): Promise<void> {
        // We don't have a direct update method, but the tool output is captured
        // in the next step's context. For full tracking, you'd update the DB here.
        console.log(`[Orchestrator] Tool ${step.toolCalled} result:`, {
            success: toolResult.success,
            hasData: !!toolResult.data
        });
    }

    /**
     * Attempt to recover from an error
     */
    private async attemptRecovery(
        task: Task,
        failedStep: ReasoningStep,
        error: unknown
    ): Promise<boolean> {
        console.log('[Orchestrator] Attempting recovery...');

        const errorMessage = error instanceof Error ? error.message : String(error);

        try {
            const prompt = buildErrorRecoveryPrompt(
                task,
                failedStep,
                errorMessage,
                1 // attempt number
            );

            const response = await this.callGemini(prompt, THINKING_BUDGETS.complex);
            const parsed = parseOrchestratorResponse(response.text);

            // If recovery suggests a different approach, continue
            if (parsed.toolCall || parsed.isComplete) {
                console.log('[Orchestrator] Recovery successful');
                return true;
            }

            return false;
        } catch (e) {
            console.error('[Orchestrator] Recovery failed:', e);
            return false;
        }
    }

    /**
     * Resolve thinking budget from config
     */
    private resolveThinkingBudget(task: Task): number {
        // Task-level override
        if (task.thinkingBudget) {
            if (typeof task.thinkingBudget === 'number') {
                return task.thinkingBudget;
            }
            return THINKING_BUDGETS[task.thinkingBudget];
        }

        // Config-level
        if (typeof this.config.thinkingBudget === 'number') {
            return this.config.thinkingBudget;
        }

        return THINKING_BUDGETS[this.config.thinkingBudget as ThinkingBudgetLevel] || -1;
    }

    /**
     * Emit an event (for SSE streaming)
     */
    private emitEvent(event: ReasoningEvent): void {
        // This would be wired up to SSE transport
        console.log(`[Orchestrator Event] ${event.type}:`, event.data);
    }

    // ============================================================================
    // Getters
    // ============================================================================

    getToolRegistry(): ToolRegistry {
        return this.toolRegistry;
    }

    getStateManager(): StateManager {
        return this.stateManager;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createOrchestrator(
    config: OrchestratorConfig,
    toolRegistry?: ToolRegistry
): Orchestrator {
    return new Orchestrator(config, toolRegistry);
}
