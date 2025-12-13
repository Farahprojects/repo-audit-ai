/**
 * State Manager
 * 
 * Persists reasoning steps and sessions to the database for:
 * - Resumability after failures
 * - UI progress tracking
 * - Audit trail
 */

import {
    ReasoningStep,
    ReasoningSession,
    SessionStatus,
    ReasoningCheckpoint,
    CompressedContext
} from './types.ts';

export interface StateManagerConfig {
    supabase: any; // SupabaseClient
    sessionId?: string;
    allowInMemoryFallback?: boolean; // Allow in-memory operation when DB fails
}

export class StateManager {
    private supabase: any;
    private sessionId: string;
    private stepCounter: number = 0;
    private totalTokens: number = 0;
    private allowInMemoryFallback: boolean;

    constructor(config: StateManagerConfig) {
        this.supabase = config.supabase;
        this.sessionId = config.sessionId || crypto.randomUUID();
        this.allowInMemoryFallback = config.allowInMemoryFallback ?? false;
    }

    // ============================================================================
    // Session Management
    // ============================================================================

    /**
     * Create a new reasoning session
     */
    async createSession(taskDescription: string, userId?: string): Promise<ReasoningSession> {
        const session: ReasoningSession = {
            id: this.sessionId,
            taskDescription,
            status: 'active',
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            totalSteps: 0,
            totalTokens: 0
        };

        const { error } = await this.supabase
            .from('reasoning_sessions')
            .insert({
                id: session.id,
                task_description: session.taskDescription,
                status: session.status,
                user_id: session.userId,
                created_at: session.createdAt,
                updated_at: session.updatedAt,
                total_steps: session.totalSteps,
                total_tokens: session.totalTokens
            });

        if (error) {
            console.error('[StateManager] Failed to create session:', error);
            if (!this.allowInMemoryFallback) {
                throw new Error(`Failed to persist session to database: ${error.message}`);
            }
            // Continue in memory only if explicitly allowed
        }

        return session;
    }

    /**
     * Resume an existing session
     */
    async resumeSession(sessionId: string): Promise<ReasoningSession | null> {
        const { data, error } = await this.supabase
            .from('reasoning_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error || !data) {
            console.error('[StateManager] Failed to resume session:', error);
            return null;
        }

        this.sessionId = data.id;
        this.stepCounter = data.total_steps;
        this.totalTokens = data.total_tokens;

        return {
            id: data.id,
            taskDescription: data.task_description,
            status: data.status,
            userId: data.user_id,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            totalSteps: data.total_steps,
            totalTokens: data.total_tokens,
            metadata: data.metadata
        };
    }

    /**
     * Update session status
     */
    async updateSessionStatus(status: SessionStatus): Promise<void> {
        const { error } = await this.supabase
            .from('reasoning_sessions')
            .update({
                status,
                updated_at: new Date().toISOString(),
                total_steps: this.stepCounter,
                total_tokens: this.totalTokens
            })
            .eq('id', this.sessionId);

        if (error) {
            console.error('[StateManager] Failed to update session status:', error);
        }
    }

    // ============================================================================
    // Step Management
    // ============================================================================

    /**
     * Save a reasoning step
     */
    async saveStep(step: Omit<ReasoningStep, 'id' | 'sessionId' | 'stepNumber' | 'createdAt'>): Promise<ReasoningStep> {
        this.stepCounter++;
        this.totalTokens += step.tokenUsage || 0;

        const fullStep: ReasoningStep = {
            ...step,
            sessionId: this.sessionId,
            stepNumber: this.stepCounter,
            createdAt: new Date().toISOString()
        };

        const { data, error } = await this.supabase
            .from('reasoning_steps')
            .insert({
                session_id: fullStep.sessionId,
                step_number: fullStep.stepNumber,
                reasoning: fullStep.reasoning,
                tool_called: fullStep.toolCalled,
                tool_input: fullStep.toolInput,
                tool_output: fullStep.toolOutput,
                token_usage: fullStep.tokenUsage,
                created_at: fullStep.createdAt
            })
            .select()
            .single();

        if (error) {
            console.error('[StateManager] Failed to save step:', error);
            if (!this.allowInMemoryFallback) {
                throw new Error(`Failed to persist step to database: ${error.message}`);
            }
            // Return the step anyway - we have it in memory only if explicitly allowed
        }

        fullStep.id = data?.id;

        // Update session totals (fire-and-forget)
        this.supabase
            .from('reasoning_sessions')
            .update({
                total_steps: this.stepCounter,
                total_tokens: this.totalTokens,
                updated_at: new Date().toISOString()
            })
            .eq('id', this.sessionId)
            .then(() => { })
            .catch((e: Error) => console.error('[StateManager] Failed to update session totals:', e));

        return fullStep;
    }

    /**
     * Get reasoning history for a session
     */
    async getHistory(limit?: number): Promise<ReasoningStep[]> {
        let query = this.supabase
            .from('reasoning_steps')
            .select('*')
            .eq('session_id', this.sessionId)
            .order('step_number', { ascending: true });

        if (limit) {
            query = query.limit(limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[StateManager] Failed to get history:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            sessionId: row.session_id,
            stepNumber: row.step_number,
            reasoning: row.reasoning,
            toolCalled: row.tool_called,
            toolInput: row.tool_input,
            toolOutput: row.tool_output,
            tokenUsage: row.token_usage,
            createdAt: row.created_at
        }));
    }

    /**
     * Get recent steps (for context building)
     */
    async getRecentSteps(count: number = 5): Promise<ReasoningStep[]> {
        const { data, error } = await this.supabase
            .from('reasoning_steps')
            .select('*')
            .eq('session_id', this.sessionId)
            .order('step_number', { ascending: false })
            .limit(count);

        if (error) {
            console.error('[StateManager] Failed to get recent steps:', error);
            return [];
        }

        return (data || []).reverse().map((row: any) => ({
            id: row.id,
            sessionId: row.session_id,
            stepNumber: row.step_number,
            reasoning: row.reasoning,
            toolCalled: row.tool_called,
            toolInput: row.tool_input,
            toolOutput: row.tool_output,
            tokenUsage: row.token_usage,
            createdAt: row.created_at
        }));
    }

    /**
     * Get the last step
     */
    async getLastStep(): Promise<ReasoningStep | null> {
        const recent = await this.getRecentSteps(1);
        return recent[0] || null;
    }

    // ============================================================================
    // Checkpoint Management
    // ============================================================================

    /**
     * Save a checkpoint for recovery
     */
    async saveCheckpoint(checkpoint: ReasoningCheckpoint): Promise<void> {
        const { error } = await this.supabase
            .from('reasoning_checkpoints')
            .upsert({
                session_id: this.sessionId,
                step_number: checkpoint.stepNumber,
                context_snapshot: checkpoint.contextSnapshot,
                last_successful_tool: checkpoint.lastSuccessfulTool,
                recovery_strategies: checkpoint.recoveryStrategies,
                created_at: new Date().toISOString()
            }, { onConflict: 'session_id,step_number' });

        if (error) {
            console.error('[StateManager] Failed to save checkpoint:', error);
        }
    }

    /**
     * Get the latest checkpoint
     */
    async getLatestCheckpoint(): Promise<ReasoningCheckpoint | null> {
        const { data, error } = await this.supabase
            .from('reasoning_checkpoints')
            .select('*')
            .eq('session_id', this.sessionId)
            .order('step_number', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return null;
        }

        return {
            stepNumber: data.step_number,
            contextSnapshot: data.context_snapshot,
            lastSuccessfulTool: data.last_successful_tool,
            recoveryStrategies: data.recovery_strategies
        };
    }

    // ============================================================================
    // Context Helpers
    // ============================================================================

    /**
     * Build compressed context from history
     */
    async buildCompressedContext(maxRecentSteps: number = 5): Promise<CompressedContext> {
        const recentSteps = await this.getRecentSteps(maxRecentSteps);
        const toolsUsed = Array.from(new Set(recentSteps.filter(s => s.toolCalled).map(s => s.toolCalled!)));

        // Build summary from recent steps
        const summaryParts = recentSteps.map(s => {
            if (s.toolCalled) {
                return `Step ${s.stepNumber}: Called ${s.toolCalled}`;
            }
            return `Step ${s.stepNumber}: Reasoning`;
        });

        // Extract key facts from reasoning
        const keyFacts = recentSteps
            .filter(s => s.reasoning.length > 50)
            .map(s => s.reasoning.slice(0, 100) + '...')
            .slice(0, 3);

        return {
            summary: summaryParts.join(' → '),
            keyFacts,
            recentSteps,
            toolsUsed
        };
    }

    // ============================================================================
    // Getters
    // ============================================================================

    getSessionId(): string {
        return this.sessionId;
    }

    getCurrentStep(): number {
        return this.stepCounter;
    }

    getTotalTokens(): number {
        return this.totalTokens;
    }
}
