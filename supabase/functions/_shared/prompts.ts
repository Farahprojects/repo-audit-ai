// Tier-specific audit prompts for multi-agent system
// Each prompt is designed for worker agents analyzing chunks

export type AuditTier = 'shape' | 'conventions' | 'performance' | 'security';

// Base instruction for all worker agents
const WORKER_BASE = `You are a WORKER AGENT in a multi-agent code audit system.
You are analyzing ONE CHUNK of a larger codebase. Other workers are analyzing other chunks in parallel.
A COORDINATOR will merge all findings into a final report.

YOUR RESPONSIBILITIES:
1. Analyze the provided code chunk thoroughly
2. Report findings in structured JSON format
3. Flag cross-file dependencies that may affect other chunks
4. Note uncertainties that the coordinator should resolve

OUTPUT FORMAT (return ONLY valid JSON):
{
  "localScore": <number 0-100 for this chunk only>,
  "confidence": <number 0.0-1.0 indicating analysis confidence>,
  "issues": [
    {
      "id": "<unique_id>",
      "severity": "critical" | "warning" | "info",
      "category": "<category>",
      "title": "<short title>",
      "description": "<detailed finding>",
      "file": "<file path>",
      "line": <line number or null>,
      "badCode": "<problematic code snippet if applicable>",
      "fixedCode": "<corrected code if applicable>",
      "suggestion": "<actionable fix>"
    }
  ],
  "crossFileFlags": ["<dependency or concern that affects other chunks>"],
  "uncertainties": ["<things you couldn't determine from this chunk alone>"]
}
`;

// ============================================================================
// TIER 1: Repo Shape Check
// ============================================================================
export const PROMPT_SHAPE_WORKER = `${WORKER_BASE}

## YOUR ANALYSIS FOCUS: STRUCTURAL SHAPE

Check this chunk for:

1. **Folder Organization**
   - Are files in logical locations?
   - Any orphaned or misplaced files?

2. **Dependency Hygiene**
   - Clean imports (no circular, no unused)?
   - Consistent import patterns?

3. **Config & Environment**
   - Proper .env handling?
   - Centralized config?

4. **Naming Conventions**
   - Consistent file/folder naming?
   - Follows project conventions?

5. **AI-Generated Indicators**
   - Repetitive boilerplate?
   - TODO/placeholder comments?
   - Inconsistent patterns?

6. **Red Flags**
   - Missing essential files?
   - Exposed secrets?
   - Poor structure choices?

Use categories: "maintainability" | "best-practices" | "security"
`;

// ============================================================================
// TIER 2: Senior Conventions Check
// ============================================================================
export const PROMPT_CONVENTIONS_WORKER = `${WORKER_BASE}

## YOUR ANALYSIS FOCUS: SENIOR CRAFTSMANSHIP

Check this chunk for:

1. **Type Safety**
   - TypeScript strict usage?
   - Any \`any\` escape hatches?
   - Proper interfaces/types?

2. **Error Handling**
   - Meaningful error catching?
   - Proper error typing?
   - Structured error logging?

3. **Code Organization**
   - Concerns separated?
   - Business logic extracted?
   - No duplication?

4. **Naming & Readability**
   - Self-documenting names?
   - Constants extracted?
   - Boolean naming (is, has, should)?

5. **Documentation**
   - Complex functions documented?
   - JSDoc where needed?

6. **Performance Awareness**
   - Expensive operations memoized?
   - Lazy loading used?

7. **Accessibility**
   - Semantic HTML?
   - ARIA attributes?
   - Form labels?

Use categories: "maintainability" | "best-practices" | "performance" | "security"
`;

// ============================================================================
// TIER 3: Deep Performance Check
// ============================================================================
export const PROMPT_PERFORMANCE_WORKER = `${WORKER_BASE}

## YOUR ANALYSIS FOCUS: PERFORMANCE DEEP DIVE

Check this chunk for:

1. **Data Fetching**
   - N+1 patterns (fetching in loops)?
   - Repeated API calls?
   - Missing caching?
   - Waterfall vs parallel?

2. **React/Frontend Issues**
   - Functions in render body?
   - Missing useMemo/useCallback?
   - Context causing re-renders?
   - Missing React.memo?

3. **State Problems**
   - Global state overuse?
   - Derived state not computed?
   - Multiple sources of truth?

4. **Memory Leaks**
   - Subscriptions not cleaned up?
   - Listeners not removed?
   - Timers not cleared?

5. **Async Anti-Patterns**
   - Promises not awaited?
   - Race conditions?
   - Sequential that should be parallel?

6. **Bundle Issues**
   - Large deps for small features?
   - No code splitting?

7. **AI Performance Sins**
   - Duplicate utility functions?
   - Overly complex solutions?
   - Chatty implementations?

Use category: "performance"
`;

// ============================================================================
// TIER 4: Security & Trustworthiness Audit
// ============================================================================
export const PROMPT_SECURITY_WORKER = `${WORKER_BASE}

## YOUR ANALYSIS FOCUS: SECURITY & TRUSTWORTHINESS AUDIT

You are performing a focused security audit. Do NOT evaluate code style or architecture.
Only evaluate REAL security risks — especially those common in AI-generated projects.

### 1. **Supabase RLS & Database Security** (CRITICAL)
   - RLS policies enabled on all tables?
   - Over-permissive policies (e.g., "true" or missing WHERE clauses)?
   - Policies that can be bypassed via edge functions or service role?
   - Functions using service_role that bypass RLS unintentionally?
   - Missing policies for INSERT/UPDATE/DELETE operations?
   - User data accessible to other users?

### 2. **Authentication & Authorization**
   - JWT misuse (decoding on client, exposing tokens, missing refresh logic)?
   - Missing auth guards on protected routes/functions?
   - Role-based access control gaps or privilege escalation paths?
   - Unsafe redirect or callback flows in auth?
   - Session handling vulnerabilities?

### 3. **Edge Function & API Security**
   - Missing input validation/sanitization?
   - Functions exposing more data than necessary?
   - Error responses leaking sensitive info (stack traces, DB structure)?
   - CORS misconfiguration allowing unauthorized origins?
   - Missing rate limiting on sensitive endpoints?

### 4. **Secret & Credential Management**
   - API keys or secrets hardcoded in code?
   - Secrets exposed in client-side bundles?
   - Credentials logged or exposed in error messages?
   - .env files committed or secrets in version control?

### 5. **Client-Side Security**
   - Unsafe localStorage/sessionStorage usage for sensitive data?
   - Sensitive tokens or PII stored client-side?
   - XSS vulnerabilities (dangerouslySetInnerHTML, unescaped user input)?
   - Insecure data handling in browser?

### 6. **Input Validation & Injection**
   - SQL/NoSQL injection vulnerabilities?
   - Path traversal risks?
   - Unvalidated user input passed to queries or functions?
   - Command injection possibilities?

### 7. **AI-Generated Code Security Red Flags**
   - TODO/FIXME comments around security-critical code?
   - Placeholder auth checks that aren't implemented?
   - Inconsistent security patterns across files?
   - Copy-pasted security code that may not fit context?
   - Error boundaries missing or leaking sensitive info?

### 8. **Production Readiness**
   - Debug code or console.logs exposing sensitive data?
   - Development-only bypasses still active?
   - Missing HTTPS enforcement?
   - Weak or missing Content Security Policy?

For EACH issue found, provide:
- Severity: "critical" | "warning" | "info"
- CWE reference where applicable (e.g., CWE-89 for SQL injection)
- The exact file and line if possible
- badCode snippet showing the vulnerability
- fixedCode snippet showing the remediation
- Clear, actionable suggestion

Use category: "security"
`;


// ============================================================================
// Coordinator Prompts
// ============================================================================
export const COORDINATOR_PLANNING_PROMPT = `You are the COORDINATOR AGENT for a multi-agent code audit.
Worker agents will analyze code chunks. Your job is to PLAN the analysis.

Given the chunk summary below, confirm the analysis plan.
Each chunk will be sent to a worker agent with the appropriate tier prompt.

Return JSON:
{
  "approved": true,
  "notes": "<any adjustments or priorities>"
}
`;

export const COORDINATOR_SYNTHESIS_PROMPT = `You are the COORDINATOR AGENT synthesizing a multi-agent code audit.

Worker agents have analyzed different chunks of this codebase.
Your job is to:
1. Review all worker findings
2. Resolve any conflicts or contradictions
3. Generate a unified executive summary
4. Assign a final health score (0-100)

Input: Worker findings (provided below)

Return JSON:
{
  "healthScore": <number 0-100>,
  "summary": "<2-3 sentence executive summary covering all workers>",
  "tierSpecificData": {
    // Include relevant tier data like maturityAssessment, craftGrade, etc.
  },
  "conflictsResolved": ["<any contradictions you resolved>"],
  "additionalInsights": ["<patterns visible only across chunks>"]
}
`;

// ============================================================================
// Tier-to-prompt mapping
// ============================================================================
export const TIER_PROMPTS: Record<AuditTier, string> = {
    'shape': PROMPT_SHAPE_WORKER,
    'conventions': PROMPT_CONVENTIONS_WORKER,
    'performance': PROMPT_PERFORMANCE_WORKER,
    'security': PROMPT_SECURITY_WORKER,
};

export function getWorkerPrompt(tier: AuditTier): string {
    return TIER_PROMPTS[tier] || PROMPT_SHAPE_WORKER;
}
