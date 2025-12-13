# Anti-Pattern Analysis Report

## Summary
This report documents anti-patterns found in the codebase related to duplicate definitions, hardcoded values, and configuration inconsistencies.

## 1. ✅ FIXED: Conflicting Thinking Budget Definitions

### Issue
Two separate and conflicting definitions for thinking budgets existed:
- `THINKING_BUDGETS` in `orchestrator/core/types.ts` (task-based: simple, audit, complex)
- `THINKING_BUDGET` in `agents/utils.ts` (role-based: CEO, SYNTHESIZER, WORKER)

### Impact
- Orchestrator attempted to use both systems simultaneously
- Confusion about which budget system was authoritative
- Potential for errors when budgets were overridden unexpectedly

### Resolution
✅ **FIXED** - Consolidated both systems into a single unified `THINKING_BUDGETS` constant in `orchestrator/core/types.ts` that includes both role-based and task-based budgets.

**Files Modified:**
1. `supabase/functions/_shared/orchestrator/core/types.ts` - Added role-based budgets to existing task-based budgets
2. `supabase/functions/_shared/agents/utils.ts` - Removed duplicate definition, now imports from unified source
3. `supabase/functions/_shared/orchestrator/core/orchestrator.ts` - Removed conflicting role assignment when using explicit budget

## 2. ⚠️ FOUND: Hardcoded Model Names

### Issue
The `audit-tools.ts` file contains hardcoded Gemini model names instead of using the centralized `GEMINI_MODEL_BY_ROLE` constant.

**Locations:**
- Line 111: `gemini-2.5-pro` (in `analyzeCodeFilesTool`)
- Line 390: `gemini-2.5-pro` (in `deepAIAnalysisTool`)

### Impact
- If model names change, multiple files need to be updated
- Inconsistent with the rest of the codebase which uses `GEMINI_MODEL_BY_ROLE`
- Harder to maintain and update model configurations

### Recommendation
Refactor `audit-tools.ts` to:
1. Import `GEMINI_MODEL_BY_ROLE` or `GEMINI_MODEL` from `agents/utils.ts`
2. Replace hardcoded model strings with the constant
3. Consider using the unified `callGemini` function instead of direct fetch calls

**Example Fix:**
```typescript
// Instead of:
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro/generateContent`

// Use:
import { GEMINI_MODEL } from '../../agents/utils.ts';
`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}/generateContent`
```

## 3. ✅ GOOD: Single Source of Truth for Permissions

### Status
**No issues found** - `PermissionLevel` enum is properly defined once in `orchestrator/core/types.ts` and imported consistently throughout the codebase.

## 4. ✅ GOOD: Single Source of Truth for Session Status

### Status
**No issues found** - `SessionStatus` type is properly defined once in `orchestrator/core/types.ts`.

## 5. ⚠️ OBSERVATION: Duplicate API Call Logic

### Issue
Both `audit-tools.ts` and `agents/utils.ts` contain similar Gemini API call logic with:
- Retry mechanisms
- Error handling
- JSON extraction
- Response parsing

### Impact
- Code duplication
- Inconsistent error handling across different parts of the system
- Harder to maintain and update API call logic

### Recommendation
The `callGemini` function in `agents/utils.ts` is already well-designed with:
- Retry logic with exponential backoff
- Robust JSON extraction
- Comprehensive error handling

**Suggestion:** Refactor `audit-tools.ts` to use the centralized `callGemini` function instead of making direct fetch calls.

## 6. ✅ GOOD: Model Selection Strategy

### Status
**Well-designed** - The `GEMINI_MODEL_BY_ROLE` constant provides a clear strategy:
- CEO/SYNTHESIZER use `gemini-2.5-pro` for reasoning tasks
- WORKER uses `gemini-2.5-flash` for speed
- Legacy `GEMINI_MODEL` constant maintained for backward compatibility

## Recommendations Summary

### High Priority
1. ✅ **COMPLETED**: Unify thinking budget definitions
2. ⚠️ **TODO**: Refactor `audit-tools.ts` to use centralized model constants
3. ⚠️ **TODO**: Refactor `audit-tools.ts` to use centralized `callGemini` function

### Medium Priority
4. Consider creating a centralized API client class to eliminate all direct fetch calls
5. Add deprecation warnings for any legacy constants that should be phased out

### Low Priority
6. Document the unified thinking budget system in developer documentation
7. Add type guards to ensure budget values are within valid ranges

## Pattern Guidelines for Future Development

To prevent similar anti-patterns:

1. **Single Source of Truth**: Always define configuration constants in one place
2. **Centralized Utilities**: Use shared utility functions instead of duplicating logic
3. **Import Over Duplicate**: Import constants rather than redefining them
4. **Type Safety**: Use TypeScript types to enforce consistent usage
5. **Documentation**: Document which constants are authoritative and which are deprecated

## Files Requiring Attention

1. `supabase/functions/_shared/orchestrator/tools/audit-tools.ts` - Needs refactoring to use centralized constants and utilities
