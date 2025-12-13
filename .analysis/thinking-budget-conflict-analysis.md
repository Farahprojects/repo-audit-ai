# Thinking Budget Conflict Analysis

## Issue Summary
There are two conflicting thinking budget systems in the codebase:

### System 1: Task-Based Budgets (`orchestrator/core/types.ts`)
```typescript
export const THINKING_BUDGETS = {
    simple: 4096,
    audit: 8192,
    complex: 16384,
    maximum: 24576
}
```
- **Purpose**: Task complexity levels
- **Used by**: Orchestrator, general task execution
- **Semantic**: Describes the complexity of the task

### System 2: Role-Based Budgets (`agents/utils.ts`)
```typescript
export const THINKING_BUDGET = {
    CEO: 20000,
    SYNTHESIZER: 100000,
    WORKER: 10000
}
```
- **Purpose**: Agent role-specific budgets
- **Used by**: Multi-agent audit system (Planner, Workers, Synthesizer)
- **Semantic**: Describes the agent's role in the system

## Conflict Points

### 1. Orchestrator Confusion (Line 287-288 in `orchestrator.ts`)
```typescript
{
    thinkingBudget: thinkingBudget,  // From THINKING_BUDGETS (task-based)
    role: 'WORKER' as AgentRole       // From THINKING_BUDGET (role-based)
}
```
The orchestrator passes both a numeric budget AND a role, but the role's budget overrides the task budget.

### 2. Type System Mismatch
- `OrchestratorConfig.thinkingBudget` expects `ThinkingBudgetLevel | number`
- `ThinkingBudgetLevel = 'simple' | 'audit' | 'complex' | 'maximum'`
- But `callGemini` expects `AgentRole = 'CEO' | 'SYNTHESIZER' | 'WORKER'`

### 3. Semantic Confusion
- Task complexity (simple/complex) is orthogonal to agent role (CEO/WORKER)
- A CEO could work on a simple task, or a WORKER on a complex task
- The current system conflates these two dimensions

## Root Cause
The codebase evolved from a single-agent system (task-based budgets) to a multi-agent system (role-based budgets) without consolidating the budget configuration.

## Impact Analysis

### Files Affected
1. `supabase/functions/_shared/orchestrator/core/types.ts` - Defines THINKING_BUDGETS
2. `supabase/functions/_shared/orchestrator/core/orchestrator.ts` - Uses both systems
3. `supabase/functions/_shared/agents/utils.ts` - Defines THINKING_BUDGET
4. `supabase/functions/_shared/agents/planner.ts` - Uses role-based budgets
5. `supabase/functions/_shared/agents/worker.ts` - Uses role-based budgets
6. `supabase/functions/audit-job-processor/index.ts` - Uses role-based budgets
7. `supabase/functions/orchestrator/index.ts` - Uses task-based budgets

### Current Usage Patterns
- **Audit system**: Uses role-based budgets (CEO, WORKER, SYNTHESIZER)
- **Orchestrator**: Attempts to use task-based budgets but gets overridden by role
- **Recovery/Error handling**: Uses task-based budgets (e.g., `THINKING_BUDGETS.complex`)

## Recommended Solution

### Option 1: Unified System (RECOMMENDED)
Create a single, comprehensive budget system that supports both dimensions:

```typescript
export const THINKING_BUDGETS = {
    // Role-based (for multi-agent systems)
    CEO: 20000,
    SYNTHESIZER: 100000,
    WORKER: 10000,
    
    // Task-based (for single-agent orchestrator)
    simple: 4096,
    audit: 8192,
    complex: 16384,
    maximum: 24576,
    
    // Default
    default: 8192
} as const;

export type ThinkingBudgetKey = keyof typeof THINKING_BUDGETS;
```

**Pros**: 
- Single source of truth
- Supports both use cases
- Clear migration path

**Cons**: 
- Mixes two semantic concepts in one object

### Option 2: Separate but Coordinated Systems
Keep both systems but make them explicit and non-conflicting:

```typescript
// For orchestrator tasks
export const TASK_THINKING_BUDGETS = {
    simple: 4096,
    audit: 8192,
    complex: 16384,
    maximum: 24576
} as const;

// For agent roles
export const AGENT_THINKING_BUDGETS = {
    CEO: 20000,
    SYNTHESIZER: 100000,
    WORKER: 10000
} as const;
```

**Pros**: 
- Clear semantic separation
- Type-safe

**Cons**: 
- More code to maintain
- Need to choose which system to use in each context

### Option 3: Role-Based Only (SIMPLEST)
Since the audit system is the primary use case, deprecate task-based budgets:

```typescript
export const THINKING_BUDGETS = {
    CEO: 20000,
    SYNTHESIZER: 100000,
    WORKER: 10000,
    
    // Aliases for backward compatibility
    simple: 10000,    // Maps to WORKER
    audit: 20000,     // Maps to CEO
    complex: 20000,   // Maps to CEO
    maximum: 100000   // Maps to SYNTHESIZER
} as const;
```

**Pros**: 
- Simplest solution
- Aligns with current primary use case
- Backward compatible

**Cons**: 
- Loses semantic meaning of task complexity

## Implementation Plan

I recommend **Option 1** (Unified System) with the following steps:

1. ✅ Consolidate both budget definitions into `orchestrator/core/types.ts`
2. ✅ Remove duplicate definition from `agents/utils.ts`
3. ✅ Update all imports to use the unified definition
4. ✅ Update `callGemini` to accept both role names and task complexity levels
5. ✅ Add deprecation warnings for any legacy usage
6. ✅ Update documentation

## Similar Anti-Patterns to Check

1. **Model selection**: Check if there are multiple model selection constants
2. **Permission levels**: Verify single source of truth for permissions
3. **Status enums**: Check for duplicate status definitions
4. **Configuration constants**: Look for other split configuration systems
