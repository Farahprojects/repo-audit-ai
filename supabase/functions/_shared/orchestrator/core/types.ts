/**
 * Universal Orchestrator Types
 * 
 * Core type definitions for the Universal Reasoning Layer.
 * These types are model-agnostic and work with any LLM.
 */

// ============================================================================
// Permission System
// ============================================================================

export enum PermissionLevel {
    READ = 'read',           // fetch_github_file, query_db
    WRITE = 'write',         // save_audit_results, create_pr
    EXECUTE = 'execute',     // run_code_fix, deploy_changes
    ADMIN = 'admin'          // system-level operations
}

// ============================================================================
// Thinking Budget Configuration
// ============================================================================

/**
 * Unified Thinking Budget System
 * 
 * This constant defines thinking budgets for both:
 * 1. Agent Roles (CEO, SYNTHESIZER, WORKER) - for multi-agent audit systems
 * 2. Task Complexity (simple, audit, complex, maximum) - for orchestrator tasks
 * 
 * The budget determines how many tokens the LLM can use for internal reasoning
 * before generating its response. Higher budgets allow for more thorough analysis
 * but cost more tokens.
 */
export const THINKING_BUDGETS = {
    // ========================================
    // Role-Based Budgets (Multi-Agent System)
    // ========================================
    CEO: 20000,         // Planner/CEO - comprehensive audit planning
    SYNTHESIZER: 100000, // Synthesizer - thorough finding consolidation
    WORKER: 10000,      // Worker agents - thorough file scanning

    // ========================================
    // Task-Based Budgets (Orchestrator)
    // ========================================
    simple: 4096,       // Basic queries
    audit: 8192,        // Code analysis
    complex: 16384,     // Multi-step reasoning
    maximum: 24576,     // Heavy analysis

    // ========================================
    // Default
    // ========================================
    default: 8192       // Fallback budget
} as const;

export type ThinkingBudgetLevel = keyof typeof THINKING_BUDGETS;

// ============================================================================
// Tool System Types
// ============================================================================

export interface ToolInputSchema {
    type: 'object';
    properties: Record<string, {
        type: string;
        description: string;
        required?: boolean;
        enum?: string[];
    }>;
    required?: string[];
}

export interface ToolContext {
    sessionId: string;
    userId?: string | undefined;
    permissions: PermissionLevel[];
    supabase: unknown; // SupabaseClient - imported separately to avoid circular deps
    preflight?: unknown; // PreflightData
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    tokenUsage?: number;
    metadata?: Record<string, unknown>;
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    requiredPermission: PermissionLevel;
    execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolDescription {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    requiredPermission: PermissionLevel;
}

// ============================================================================
// Reasoning Step Types
// ============================================================================

export interface ReasoningStep {
    id?: string;
    sessionId: string;
    stepNumber: number;
    reasoning: string;          // <thinking> content
    toolCalled?: string | undefined;        // tool name if any
    toolInput?: unknown;        // tool parameters
    toolOutput?: unknown;       // tool results
    tokenUsage: number;
    createdAt: string;
}

export interface ReasoningCheckpoint {
    stepNumber: number;
    contextSnapshot: string;    // Summarized context up to this point
    lastSuccessfulTool?: string;
    recoveryStrategies: string[];
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'active' | 'completed' | 'failed' | 'paused';

export interface ReasoningSession {
    id: string;
    taskDescription: string;
    status: SessionStatus;
    userId?: string | undefined;
    createdAt: string;
    updatedAt: string;
    totalSteps: number;
    totalTokens: number;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Task Types
// ============================================================================

export interface Task {
    id: string;
    description: string;
    type: 'audit' | 'fix' | 'analyze' | 'custom';
    context?: Record<string, unknown> | undefined;
    requiredPermissions?: PermissionLevel[];
    thinkingBudget?: ThinkingBudgetLevel | number;
    maxIterations?: number;
}

// ============================================================================
// Orchestrator Configuration
// ============================================================================

export interface ParallelBatchConfig {
    maxConcurrency: number;
    batchSize: number;
    requiresSequentialReview: boolean; // LLM reviews parallel results before continuing
}

export interface OrchestratorConfig {
    apiKey: string;
    maxIterations: number;
    thinkingBudget: ThinkingBudgetLevel | number;
    streamCallback?: (step: ReasoningStep) => void | Promise<void>;
    supabase: unknown; // SupabaseClient
    userId?: string | undefined;
    permissions?: PermissionLevel[];
    parallelBatch?: ParallelBatchConfig;
}

// ============================================================================
// Orchestrator Result Types
// ============================================================================

export interface OrchestratorResult {
    success: boolean;
    sessionId: string;
    finalOutput?: unknown;
    reasoningHistory: ReasoningStep[];
    totalTokens: number;
    totalSteps: number;
    error?: string;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// Streaming Types
// ============================================================================

export type ReasoningEventType =
    | 'thinking'      // New reasoning step
    | 'tool_call'     // Tool being called
    | 'tool_result'   // Tool returned result
    | 'complete'      // Task completed
    | 'error'         // Error occurred
    | 'checkpoint';   // Checkpoint saved

export interface ReasoningEvent {
    type: ReasoningEventType;
    sessionId: string;
    stepNumber: number;
    data: unknown;
    timestamp: string;
}

export interface StreamingTransport {
    send(event: ReasoningEvent): Promise<void>;
    close(): Promise<void>;
}

// ============================================================================
// Batched Tool Calls (for parallel mode)
// ============================================================================

export interface BatchedToolCall {
    tools: Array<{
        name: string;
        input: unknown;
        priority: number;  // execution order
    }>;
    executionMode: 'parallel' | 'sequential' | 'conditional';
}

// ============================================================================
// Human Intervention (future capability)
// ============================================================================

export interface HumanIntervention {
    stepNumber: number;
    question: string;
    options?: string[];
    timeout: number;  // auto-continue after timeout (ms)
}

// ============================================================================
// Reasoning Metrics
// ============================================================================

export interface ReasoningMetrics {
    stepCount: number;
    toolUsageEfficiency: number;  // tools used vs. available
    contextRetention: number;     // how well context is maintained
    decisionAccuracy: number;     // measured against expected outcomes
    averageStepDuration: number;  // ms
    tokenEfficiency: number;      // output quality per token
}

// ============================================================================
// LLM Response Types
// ============================================================================

export interface ParsedLLMResponse {
    thinking: string;
    toolCall?: {
        name: string;
        input: unknown;
    };
    isComplete: boolean;
    finalOutput?: unknown;
}

// ============================================================================
// Context Types
// ============================================================================

export interface CompressedContext {
    summary: string;
    keyFacts: string[];
    recentSteps: ReasoningStep[];
    toolsUsed: string[];
}
