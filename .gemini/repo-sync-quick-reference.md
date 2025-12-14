# Repo Sync Fix - Quick Reference

## What Was Fixed

**Critical Bug**: `syncRepo()` and `downloadAndStoreRepo()` couldn't access private repositories because they weren't retrieving GitHub tokens internally.

**Solution**: Both functions now retrieve tokens from the `preflights` table using `GitHubAuthenticator.getTokenByAccountId()`.

## How It Works Now

### 1. User Submits Audit
```
User clicks "Run Audit" → audit-job-submit receives request
```

### 2. Sync Before Audit (NEW!)
```typescript
// audit-job-submit/index.ts (line 261)
const syncResult = await storageService.syncRepo(
    preflight.owner,
    preflight.repo,
    preflightDetails?.default_branch || 'main'
);
```

### 3. Token Retrieved Internally
```typescript
// RepoStorageService.syncRepo() (NEW CODE)
const { data: preflightData } = await this.supabase
    .from('preflights')
    .select('github_account_id, is_private')
    .eq('owner', owner)
    .eq('repo', repo)
    .maybeSingle();

if (preflightData?.is_private && preflightData?.github_account_id) {
    effectiveToken = await GitHubAuthenticator
        .getInstance()
        .getTokenByAccountId(preflightData.github_account_id);
}
```

### 4. SHA Comparison
```typescript
const storedSha = repoData.commit_sha;
const latestSha = await githubClient.getLatestCommit(owner, repo, branch);

if (storedSha === latestSha) {
    // Already up-to-date, skip download
    return { synced: false, changes: 0 };
}
```

### 5. Delta Sync (Only Changed Files)
```typescript
const comparison = await githubClient.compareCommits(
    owner, repo, storedSha, latestSha
);

for (const file of comparison.files) {
    if (file.status === 'removed') {
        changes.push({ path: file.filename, content: null });
    } else {
        const content = await githubClient.getFileContent(...);
        changes.push({ path: file.filename, content });
    }
}
```

### 6. Update Canonical Storage
```typescript
await this.patchRepoFiles(repoData.id, changes);
await this.supabase
    .from('repos')
    .update({ commit_sha: latestSha })
    .eq('id', repoData.id);
```

### 7. Run Audit on Latest Code
```
Audit runs using canonical storage at: {owner}_{repo}/archive.zip
```

## Key Improvements

### Before
- ❌ Private repos couldn't sync (no token)
- ❌ Audits ran on stale data
- ❌ Fixes didn't show up in next audit
- ❌ Users had to manually re-import

### After
- ✅ Private repos sync automatically
- ✅ Audits always use latest code
- ✅ Fixes show up immediately
- ✅ Single canonical storage per repo
- ✅ Delta sync minimizes API calls

## Logging

Watch for these log messages:

```
🔐 Retrieved GitHub token for private repo {owner/repo}
ℹ️ Repo {owner/repo} is already up-to-date (SHA: abc123)
🔄 Syncing {owner/repo}: abc123 → def456
📥 Fetching 5 changed files for {owner/repo}...
✅ Synced {owner/repo}: 5 changes applied, commit_sha updated to def456
```

## Testing

1. **Test Private Repo Sync**:
   - Submit audit for private repo
   - Check logs for: `🔐 Retrieved GitHub token`
   - Verify audit completes successfully

2. **Test Delta Sync**:
   - Submit audit (initial)
   - Push changes to GitHub
   - Submit audit again
   - Check logs for: `🔄 Syncing {owner/repo}: {old} → {new}`
   - Verify only changed files are fetched

3. **Test Stale Detection**:
   - Submit audit twice without code changes
   - Check logs for: `ℹ️ Repo {owner/repo} is already up-to-date`
   - Verify no download occurs

## Files Modified

- `supabase/functions/_shared/services/RepoStorageService.ts`
  - Added `GitHubAuthenticator` import
  - Added token retrieval to `syncRepo()`
  - Added token retrieval to `downloadAndStoreRepo()`
  - Enhanced logging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Audit Flow                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │ audit-job-submit│
                  └────────┬────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ RepoStorageService     │
              │   .syncRepo()          │
              └────────┬───────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌────────┐   ┌──────────┐   ┌──────────┐
   │Preflight│   │ GitHub   │   │  Repos   │
   │  Table  │   │   API    │   │  Table   │
   └────────┘   └──────────┘   └──────────┘
        │              │              │
        │              │              │
        ▼              ▼              ▼
   github_account_id  latest_sha   commit_sha
        │              │              │
        └──────────────┴──────────────┘
                       │
                       ▼
              Compare & Sync Delta
                       │
                       ▼
           Update Canonical Storage
                       │
                       ▼
              Run Audit on Latest
```

## Security

- ✅ Tokens NEVER sent to frontend
- ✅ Tokens retrieved server-side only
- ✅ Tokens decrypted using `GitHubAuthenticator`
- ✅ Tokens used only for GitHub API calls
- ✅ Public repos work without tokens

## Troubleshooting

### "Failed to sync repository"
- Check: Does preflight have `github_account_id`?
- Check: Is token valid in `github_accounts` table?
- Check: Can token access the repository?

### "Audit running on stale code"
- Check: Is `commit_sha` being updated in `repos` table?
- Check: Are sync logs showing successful delta fetch?
- Check: Is storage path deterministic (not timestamp-based)?

### "Private repo sync failing"
- Check logs for: `⚠️ Failed to retrieve GitHub token`
- Verify: `preflights.github_account_id` is set
- Verify: `github_accounts.access_token_encrypted` exists
- Verify: Token has repo access permissions
