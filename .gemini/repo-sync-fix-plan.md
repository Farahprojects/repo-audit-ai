# Repo Sync Fix - Implementation Plan

## Problem Statement
Audits are generating on stale repos and/or re-importing fresh copies instead of updating the canonical stored repo.

## Root Cause Analysis

### ✅ What's Working
1. **Single Canonical Storage** - Using `owner_repo` as stable key (e.g., "Farahprojects/repo-audit-ai")
2. **Deterministic Storage Path** - `{owner}_{repo}/archive.zip` (no timestamp folders)
3. **Sync Before Audit** - Both `audit-job-submit` and `preflight-manager` call `syncRepo()`
4. **SHA-based Change Detection** - Using `commit_sha` to detect changes
5. **Delta Sync** - Using GitHub Compare API to fetch only changed files

### ❌ Critical Bug Found
**`syncRepo()` cannot access private repos because token retrieval is broken**

Current flow:
```typescript
// In audit-job-submit/index.ts (line 261)
const syncResult = await storageService.syncRepo(
    preflight.owner,
    preflight.repo,
    preflightDetails?.default_branch || 'main'
    // SECURITY: Token retrieved internally from github_account_id
);
```

Problem: The comment says "Token retrieved internally" but `syncRepo()` does NOT retrieve the token!

`syncRepo()` signature:
```typescript
async syncRepo(owner: string, repo: string, branch: string, token?: string)
```

It accepts a `token` parameter, but:
1. Callers don't pass it (expecting internal retrieval)
2. `syncRepo()` doesn't retrieve it internally
3. Result: Private repos fail to sync

## Solution

### Fix 1: Make syncRepo() Retrieve Token Internally

Modify `RepoStorageService.syncRepo()` to:
1. Look up the repo's `github_account_id` from the `preflights` table
2. Use `GitHubAuthenticator.getTokenByAccountId()` to decrypt the token
3. Pass the token to GitHub API calls

### Fix 2: Update downloadAndStoreRepo() Similarly

The same issue exists in `downloadAndStoreRepo()` - it should also retrieve tokens internally.

### Fix 3: Document the Single Entry Point

Make it crystal clear that:
- `syncRepo()` is the ONLY function that should be called for repo updates
- `downloadAndStoreRepo()` is ONLY called by `syncRepo()` when repo doesn't exist
- External callers should NEVER call `downloadAndStoreRepo()` directly

## Implementation Steps

1. ✅ Add token retrieval to `syncRepo()`
2. ✅ Add token retrieval to `downloadAndStoreRepo()`
3. ✅ Add logging to track sync operations
4. ✅ Update comments to clarify the architecture
5. ✅ Test with both public and private repos

## Expected Outcome

After the fix:
- ✅ `syncRepo()` works for both public and private repos
- ✅ Audits always use latest code (no stale data)
- ✅ No duplicate downloads (reuses canonical storage)
- ✅ Delta sync works correctly (only fetches changed files)
- ✅ Single source of truth for repo storage
