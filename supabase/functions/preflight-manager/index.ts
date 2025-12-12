// Preflight Manager - Single source of truth for repository metadata
// This edge function manages the lifecycle of preflight records

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthenticatedUserId } from '../_shared/utils.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Types
interface PreflightRecord {
    id: string;
    repo_url: string;
    owner: string;
    repo: string;
    default_branch: string;
    repo_map: FileMapItem[];
    stats: any;
    fingerprint: any;
    is_private: boolean;
    fetch_strategy: 'public' | 'authenticated';
    github_account_id: string | null;
    token_valid: boolean;
    user_id: string | null;
    file_count: number;
    created_at: string;
    updated_at: string;
    expires_at: string;
}

interface FileMapItem {
    path: string;
    size: number;
    type: string;
    url?: string;
}

interface PreflightRequest {
    action: 'get' | 'create' | 'refresh' | 'invalidate';
    repoUrl: string;
    forceRefresh?: boolean;
    userToken?: string; // GitHub token passed from frontend
    installationId?: number; // GitHub App installation ID (optional)
}

interface PreflightResponse {
    success: boolean;
    preflight?: PreflightRecord;
    source?: 'cache' | 'fresh';
    error?: string;
    errorCode?: string;
    requiresAuth?: boolean;
}

// Environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Extract owner/repo from GitHub URL
 */
// Import canonical parser from shared utils
import { parseGitHubRepo } from '../_shared/utils.ts';
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import { GitHubAppClient } from '../_shared/github/GitHubAppClient.ts';
import { FileCacheManager } from '../_shared/github/FileCacheManager.ts';
import { RepoStorageService } from '../_shared/services/RepoStorageService.ts';

// Alias for backward compatibility
function parseGitHubUrl(url: string) {
    return parseGitHubRepo(url);
}


/**
 * Check if a preflight record is still valid
 */
function isPreflightValid(preflight: PreflightRecord): boolean {
    // Check expiration
    if (new Date(preflight.expires_at) < new Date()) {
        return false;
    }

    // If private repo, check token validity
    if (preflight.is_private && !preflight.token_valid) {
        return false;
    }

    return true;
}

/**
 * Fetch fresh preflight data from GitHub via github-proxy
 */
async function fetchFreshPreflightData(
    supabase: any,
    owner: string,
    repo: string,
    userToken?: string,
    authHeader?: string | null,
    installationId?: number
): Promise<{
    stats: any;
    fingerprint: any;
    fileMap: FileMapItem[];
    isPrivate: boolean;
    defaultBranch: string;
} | { error: string; errorCode: string; requiresAuth: boolean }> {

    // Determine which client to use
    let clientType = 'oauth'; // Default
    let effectiveToken = userToken;

    if (installationId) {
        // Use GitHub App client - pass installation ID to github-proxy
        clientType = 'app';
        effectiveToken = undefined; // Don't pass user token for app installations
    }

    // Call github-proxy with preflight action
    const { data, error } = await supabase.functions.invoke('github-proxy', {
        body: {
            owner,
            repo,
            action: 'preflight',
            userToken: effectiveToken,
            installationId: installationId, // Pass installation ID
            clientType // For future extension
        },
        headers: authHeader ? { authorization: authHeader } : undefined
    });

    if (error) {
        console.error(`❌ [preflight-manager] GitHub proxy error:`, error);
        return {
            error: error.message || 'Failed to fetch repository data',
            errorCode: 'GITHUB_ERROR',
            requiresAuth: false
        };
    }

    if (data?.error) {
        return {
            error: data.error,
            errorCode: data.errorCode || 'UNKNOWN',
            requiresAuth: data.requiresAuth || false
        };
    }


    return {
        stats: data.stats,
        fingerprint: data.fingerprint,
        fileMap: data.fileMap || [],
        isPrivate: data.stats?.isPrivate || false,
        defaultBranch: data.stats?.defaultBranch || 'main'
    };
}

/**
 * Get or create a preflight record for a repository
 */
async function getOrCreatePreflight(
    supabase: any,
    repoUrl: string,
    userId: string | null,
    userToken?: string,
    authHeader?: string | null,
    forceRefresh: boolean = false,
    installationId?: number
): Promise<PreflightResponse> {

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        return {
            success: false,
            error: 'Invalid GitHub repository URL',
            errorCode: 'INVALID_URL'
        };
    }

    const { owner, repo } = parsed;
    const normalizedUrl = `https://github.com/${owner}/${repo}`;


    // Step 1: Try to find an existing valid preflight
    if (!forceRefresh) {
        let query = supabase
            .from('preflights')
            .select('*')
            .eq('repo_url', normalizedUrl);

        // Priority order:
        // 1. GitHub App installation (if provided)
        // 2. User's OAuth preflight
        // 3. Public repo preflight
        if (installationId) {
            // Look for preflight with this installation
            query = query.eq('installation_id', installationId);
        } else if (userId) {
            // For authenticated users, prefer their own preflight
            query = query.eq('user_id', userId);
        } else {
            // For anonymous users, only look for public repo preflights
            query = query.is('user_id', null).eq('is_private', false);
        }

        const { data: existingPreflights, error: lookupError } = await query.limit(1);

        if (lookupError) {
            console.error(`❌ [preflight-manager] Preflight lookup error:`, lookupError);
        } else if (existingPreflights && existingPreflights.length > 0) {
            const existing = existingPreflights[0] as PreflightRecord;

            if (isPreflightValid(existing)) {
                return {
                    success: true,
                    preflight: existing,
                    source: 'cache'
                };
            } else {
            }
        }
    }

    // Step 2: Fetch fresh data from GitHub
    const freshData = await fetchFreshPreflightData(supabase, owner, repo, userToken, authHeader, installationId);

    if ('error' in freshData) {
        return {
            success: false,
            error: freshData.error,
            errorCode: freshData.errorCode,
            requiresAuth: freshData.requiresAuth
        };
    }

    // Step 3: Get the user's GitHub account ID if they have one
    let githubAccountId: string | null = null;
    if (userId) {
        const { data: githubAccount } = await supabase
            .from('github_accounts')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (githubAccount) {
            githubAccountId = githubAccount.id;
        }
    }

    // Step 4: Create or update the preflight record
    const preflightData = {
        repo_url: normalizedUrl,
        owner,
        repo,
        default_branch: freshData.defaultBranch,
        repo_map: freshData.fileMap,
        stats: freshData.stats,
        fingerprint: freshData.fingerprint,
        is_private: freshData.isPrivate,
        fetch_strategy: freshData.isPrivate ? 'authenticated' : 'public',
        github_account_id: githubAccountId,
        installation_id: installationId,
        token_valid: true,
        user_id: userId,
        file_count: freshData.fileMap.length,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    // Try to upsert (update if exists, insert if not)
    let upsertQuery;

    if (installationId) {
        // For GitHub App installations, use repo_url + installation_id as conflict target
        upsertQuery = supabase
            .from('preflights')
            .upsert(preflightData, {
                onConflict: 'repo_url,installation_id',
                ignoreDuplicates: false
            })
            .select()
            .single();
    } else if (userId) {
        // For authenticated users with OAuth, use repo_url + user_id as the conflict target
        upsertQuery = supabase
            .from('preflights')
            .upsert(preflightData, {
                onConflict: 'repo_url,user_id',
                ignoreDuplicates: false
            })
            .select()
            .single();
    } else {
        // For anonymous users with public repos, just insert (no upsert to avoid conflicts)
        // First try to delete any existing anonymous preflight for this repo
        await supabase
            .from('preflights')
            .delete()
            .eq('repo_url', normalizedUrl)
            .is('user_id', null)
            .is('installation_id', null);

        upsertQuery = supabase
            .from('preflights')
            .insert(preflightData)
            .select()
            .single();
    }

    const { data: newPreflight, error: insertError } = await upsertQuery;

    if (insertError) {
        console.error(`❌ [preflight-manager] Failed to save preflight:`, insertError);
        // Return the data anyway, just not cached
        return {
            success: true,
            preflight: {
                ...preflightData,
                id: 'ephemeral-' + Date.now(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            } as PreflightRecord,
            source: 'fresh'
        };
    }

    // Step 5: Download and store entire repository as archive (ONE API CALL)
    // CRITICAL: This is SYNCHRONOUS - we MUST wait for repo to be stored before returning
    // FAIL-FAST: If download fails, the preflight fails
    if (newPreflight) {
        console.log(`📦 [preflight-manager] Downloading repo archive for ${owner}/${repo}...`);

        const storageService = new RepoStorageService(supabase);
        const result = await storageService.downloadAndStoreRepo(
            newPreflight.id,
            owner,
            repo,
            freshData.defaultBranch,
            userToken // Pass token for private repos
        );

        if (!result.success) {
            // FAIL-FAST: If we can't store the repo, fail the entire preflight
            console.error(`❌ [preflight-manager] Repo storage FAILED:`, result.error);
            throw new Error(`Failed to download repository: ${result.error}`);
        }

        console.log(`✅ [preflight-manager] Repo stored: ${result.fileCount} files, ${(result.archiveSize / 1024).toFixed(1)}KB`);
    }

    return {
        success: true,
        preflight: newPreflight as PreflightRecord,
        source: 'fresh'
    };
}

/**
 * Invalidate a preflight (mark token as invalid)
 */
async function invalidatePreflight(
    supabase: any,
    repoUrl: string,
    userId: string | null
): Promise<{ success: boolean; error?: string }> {

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        return { success: false, error: 'Invalid GitHub repository URL' };
    }

    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    let query = supabase
        .from('preflights')
        .update({ token_valid: false, updated_at: new Date().toISOString() })
        .eq('repo_url', normalizedUrl);

    if (userId) {
        query = query.eq('user_id', userId);
    }

    const { error } = await query;

    if (error) {
        console.error(`❌ [preflight-manager] Failed to invalidate preflight:`, error);
        return { success: false, error: error.message };
    }

    return { success: true };
}

// Main handler
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const authHeader = req.headers.get('authorization');

        // Get authenticated user ID (returns null if not authenticated)
        let userId: string | null = null;
        try {
            userId = await getAuthenticatedUserId(req, supabase);
        } catch {
            // User is not authenticated, userId remains null
        }

        const body: PreflightRequest = await req.json();
        const { action, repoUrl, forceRefresh, userToken, installationId } = body;


        if (!repoUrl) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required parameter: repoUrl' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        let response: PreflightResponse;

        switch (action) {
            case 'get':
            case 'create':
            case 'refresh':
                response = await getOrCreatePreflight(
                    supabase,
                    repoUrl,
                    userId,
                    userToken,
                    authHeader,
                    action === 'refresh' || forceRefresh,
                    installationId
                );
                break;

            case 'invalidate':
                const invalidateResult = await invalidatePreflight(supabase, repoUrl, userId);
                response = invalidateResult.error ?
                    { success: invalidateResult.success, error: invalidateResult.error } :
                    { success: invalidateResult.success };
                break;

            default:
                response = {
                    success: false,
                    error: `Unknown action: ${action}`,
                    errorCode: 'INVALID_ACTION'
                };
        }

        const status = response.success ? 200 : (response.errorCode === 'INVALID_URL' ? 400 : 200);

        return new Response(
            JSON.stringify(response),
            { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('❌ [preflight-manager] Unhandled error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorCode: 'INTERNAL_ERROR'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
