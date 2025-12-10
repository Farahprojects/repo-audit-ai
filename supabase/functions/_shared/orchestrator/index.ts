/**
 * Universal Orchestrator - Main Export
 * 
 * Re-exports all orchestrator components for easy importing.
 */

// Core exports
export { Orchestrator, createOrchestrator } from './core/orchestrator.ts';
export { StateManager } from './core/state-manager.ts';
export { ToolRegistry, createToolRegistry, getToolRegistry } from './core/tool-registry.ts';
export {
    buildSystemPrompt,
    buildContinuationPrompt,
    buildErrorRecoveryPrompt,
    buildContextCompressionPrompt,
    buildParallelBatchPrompt,
    parseOrchestratorResponse
} from './core/prompt-templates.ts';

// Type exports
export type {
    Tool,
    ToolResult,
    ToolContext,
    ToolDescription,
    ToolInputSchema,
    Task,
    OrchestratorConfig,
    OrchestratorResult,
    ReasoningStep,
    ReasoningSession,
    ReasoningCheckpoint,
    ReasoningEvent,
    StreamingTransport,
    CompressedContext,
    ParallelBatchConfig,
    BatchedToolCall,
    HumanIntervention,
    ReasoningMetrics,
    ParsedLLMResponse
} from './core/types.ts';

export {
    PermissionLevel,
    THINKING_BUDGETS
} from './core/types.ts';

// Utility exports
export { TokenChunker, getTokenChunker } from './utils/token-chunker.ts';
export { ContextBuilder, createContextBuilder } from './utils/context-builder.ts';

// Tool exports
export { githubTools } from './tools/github-tools.ts';
export { dbTools } from './tools/db-tools.ts';
export { auditTools } from './tools/audit-tools.ts';
