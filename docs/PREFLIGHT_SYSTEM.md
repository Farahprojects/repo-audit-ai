# Preflight System Implementation

## Overview

The Preflight System provides a **single source of truth** for repository metadata before any audit runs. It eliminates guessing about repository state by agents, ensures consistent token validation, and enables fast re-auditing of previously analyzed repositories.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  PreflightModal.tsx                                             │
│    └── calls PreflightService.getOrCreate(repoUrl)             │
│         └── stores preflightId                                  │
│         └── passes preflightId to onConfirmAudit()             │
├─────────────────────────────────────────────────────────────────┤
│  useAuditOrchestrator.ts                                        │
│    └── handleConfirmAudit(tier, stats, fileMap, preflightId)   │
│         └── AuditService.executeAudit(..., preflightId)        │
│              └── generateAuditReport(..., preflightId)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase Edge Functions                        │
├─────────────────────────────────────────────────────────────────┤
│  preflight-manager/index.ts                                     │
│    └── action: 'get' | 'create' | 'refresh' | 'invalidate'    │
│    └── Checks for cached preflight in `preflights` table       │
│    └── If not found, calls github-proxy for fresh data         │
│    └── Stores/updates preflight in database                    │
│    └── Returns { success, preflight, source: 'cache'|'fresh' } │
├─────────────────────────────────────────────────────────────────┤
│  audit-runner/index.ts                                          │
│    └── Accepts preflightId OR files directly                   │
│    └── If preflightId provided, fetches from database          │
│    └── Extracts repo_map as fileMap                            │
│    └── Passes preflight data to agents via AuditContext         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Database                                   │
├─────────────────────────────────────────────────────────────────┤
│  preflights table                                               │
│    ├── id (UUID, PK)                                            │
│    ├── repo_url (TEXT, indexed)                                 │
│    ├── owner, repo (TEXT)                                       │
│    ├── default_branch (TEXT)                                    │
│    ├── repo_map (JSONB) - file structure                        │
│    ├── stats (JSONB) - repo stats snapshot                      │
│    ├── fingerprint (JSONB) - complexity analysis                │
│    ├── is_private (BOOLEAN)                                     │
│    ├── fetch_strategy ('public' | 'authenticated')              │
│    ├── github_account_id (FK to github_accounts)                │
│    ├── token_valid (BOOLEAN)                                    │
│    ├── user_id (FK to auth.users)                               │
│    ├── file_count (INTEGER)                                     │
│    ├── created_at, updated_at, expires_at (TIMESTAMPTZ)        │
│    └── RLS policies for user isolation                          │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files Created/Modified

### New Files

1. **`supabase/migrations/20251209000001_create_preflights_table.sql`**
   - Creates the `preflights` table with comprehensive schema
   - Includes RLS policies for user isolation
   - Indexes for efficient queries
   - Cleanup function for expired preflights

2. **`supabase/functions/preflight-manager/index.ts`**
   - Edge function for managing preflight lifecycle
   - Actions: get, create, refresh, invalidate
   - Calls github-proxy for fresh data
   - Stores/retrieves from database

3. **`services/preflightService.ts`**
   - Frontend service class for preflight operations
   - `PreflightService.getOrCreate(repoUrl, options)`
   - `PreflightService.refresh(repoUrl)`
   - `PreflightService.invalidate(repoUrl)`
   - `PreflightService.toAuditContext(preflight)`

### Modified Files

1. **`supabase/functions/_shared/agents/types.ts`**
   - Added `PreflightData` interface
   - Updated `AuditContext` to include optional `preflight` field

2. **`supabase/functions/audit-runner/index.ts`**
   - Accepts `preflightId` or `preflight` in request body
   - Fetches preflight from database when ID provided
   - Passes preflight data to agents via context

3. **`services/geminiService.ts`**
   - Added `preflightId` parameter to `generateAuditReport`

4. **`services/auditService.ts`**
   - Added `preflightId` parameter to `executeAudit`

5. **`components/PreflightModal.tsx`**
   - Uses new `PreflightService` for database-backed preflights
   - Stores and passes `preflightId` downstream

6. **`hooks/useAuditOrchestrator.ts`**
   - Updated `handleConfirmAudit` to accept `preflightId`

7. **`components/AuditFlow.tsx`**
   - Updated props interface for new callback signature

8. **`services/githubService.ts`**
   - Exported `FileMapItem` interface

## Usage Flow

### 1. User Enters Repository URL

```typescript
// PreflightModal.tsx
const response = await fetchPreflight(repoUrl, { userToken: token });

if (!response.success) {
  if (PreflightService.requiresGitHubAuth(response)) {
    // Show GitHub connect modal
  } else {
    // Show error
  }
  return;
}

// Store preflight ID for audit
setPreflightId(response.preflight.id);
```

### 2. User Selects Audit Tier

```typescript
// Passed to audit runner
onConfirm(tier, stats, fileMap, preflightId);
```

### 3. Audit Execution

```typescript
// audit-runner/index.ts
const { preflightId, preflight: preflightData } = body;

// Fetch from database if needed
if (preflightId && !preflightRecord) {
  const { data } = await supabase
    .from('preflights')
    .select('*')
    .eq('id', preflightId)
    .single();
  preflightRecord = data;
}

// Use preflight data
fileMap = preflightRecord.repo_map;
```

### 4. Agents Receive Context

```typescript
// Agents get full preflight data
const context: AuditContext = {
  repoUrl,
  files: [...],
  tier,
  preflight: {
    id: preflightRecord.id,
    repo_url: preflightRecord.repo_url,
    owner: preflightRecord.owner,
    repo: preflightRecord.repo,
    is_private: preflightRecord.is_private,
    fetch_strategy: preflightRecord.fetch_strategy,
    // ... all other fields
  },
  githubToken
};
```

## Benefits

1. **No Guessing**: Agents receive complete repo metadata upfront
2. **Instant Re-Audits**: Cached preflights enable fast repeated audits
3. **Token Validation**: Centralized, stored token validity state
4. **Access Control**: RLS ensures user isolation
5. **Deterministic**: Stable, predictable audit behavior
6. **Scalable**: Database-backed with automatic expiration

## Deployment Steps

1. **Push migration to Supabase**:
   ```bash
   npx supabase db push
   ```

2. **Deploy edge functions**:
   ```bash
   npx supabase functions deploy preflight-manager
   npx supabase functions deploy audit-runner
   npx supabase functions deploy github-proxy
   ```

3. **Regenerate Supabase types** (optional for type safety):
   ```bash
   npx supabase gen types typescript > src/integrations/supabase/types.ts
   ```

## Future Enhancements

- [ ] Add preflight versioning for repo changes
- [ ] Implement preflight diff detection
- [ ] Add preflight sharing between users (public repos)
- [ ] Webhook-triggered preflight refresh on repo pushes
- [ ] Preflight analytics dashboard
