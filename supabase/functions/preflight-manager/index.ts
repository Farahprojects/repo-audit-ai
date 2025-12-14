// Preflight Manager - Single source of truth for repository metadata
// This edge function manages the lifecycle of preflight records

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from '../_shared/utils.ts';
import { Database } from '../_shared/database.types.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface PreflightRecord {
    id: string;
    repo_url: string;
    owner: string;
    repo: string;
    default_branch: string;
    repo_map: FileMapItem[];
    stats: Record<string, unknown>;
    fingerprint: Record<string, unknown>;
    is_private: boolean;
    fetch_strategy: 'public' | 'authenticated';
    github_account_id: string | null;
    installation_id?: number;
    token_valid: boolean;
    user_id: string | null;
    file_count: number;
    created_at?: string;
    updated_at?: string;
    expires_at: string;
}

interface FileMapItem {
    path: string;
    size?: number;
    type: string;
}

interface PreflightRequest {
    action: 'get' | 'create' | 'refresh' | 'invalidate';
    repoUrl: string;
    forceRefresh?: boolean;
    // SECURITY: userToken removed - tokens only from Authorization header
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

// Declare Deno global for Supabase Edge Functions
declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

// Environment - using generated Database types
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Extract owner/repo from GitHub URL
 */
// Import canonical parser from shared utils
import { parseGitHubRepo } from '../_shared/utils.ts';
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
    supabase: ReturnType<typeof createClient>,
    owner: string,
    repo: string,
    authHeader?: string | null,
    installationId?: number
): Promise<{
    stats: Record<string, unknown>;
    fingerprint: Record<string, unknown>;
    fileMap: FileMapItem[];
    isPrivate: boolean;
    defaultBranch: string;
} | { error: string; errorCode: string; requiresAuth: boolean }> {

    // SECURITY: No userToken - only Authorization header
    // Call github-proxy with preflight action
    const invokeOptions: any = {
        body: {
            owner,
            repo,
            action: 'preflight',
            installationId: installationId // Pass installation ID for GitHub App
        }
    };

    if (authHeader) {
        invokeOptions.headers = { authorization: authHeader };
    }

    const { data, error } = await supabase.functions.invoke('github-proxy', invokeOptions);

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
    supabase: ReturnType<typeof createClient>,
    repoUrl: string,
    userId: string | null,
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
            const existing = existingPreflights[0] as unknown as PreflightRecord;

            if (isPreflightValid(existing)) {
                // Even with cached preflight, ensure repository data is fresh
                console.log(`🔄 [preflight-manager] Syncing repository for cached preflight ${existing.id}...`);

                const storageService = new RepoStorageService(supabase);
                const syncResult = await storageService.syncRepo(
                    owner,
                    repo,
                    existing.default_branch
                    // SECURITY: Token now retrieved internally from github_account_id
                );

                if (!syncResult.synced && syncResult.error) {
                    // FAIL-FAST: Don't serve stale data
                    console.error(`❌ [preflight-manager] CRITICAL: Repo sync failed for cached preflight:`, syncResult.error);
                    throw new Error(`Failed to sync repository: ${syncResult.error}`);
                }

                if (syncResult.changes > 0) {
                    console.log(`✅ [preflight-manager] Synced ${syncResult.changes} changes for cached preflight`);
                } else {
                    console.log(`ℹ️ [preflight-manager] Repository already up-to-date for cached preflight`);
                }

                return {
                    success: true,
                    preflight: existing,
                    source: 'cache'
                };
            } else {
                // Cache check failed, will fetch fresh data below
            }
        }
    }

    // Step 2: Fetch fresh data from GitHub (SECURITY: No userToken)
    const freshData = await fetchFreshPreflightData(supabase, owner, repo, authHeader, installationId);

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

        if (githubAccount && typeof githubAccount === 'object' && 'id' in githubAccount) {
            githubAccountId = (githubAccount as { id: string }).id;
        }
    }

    // Step 4: Create or update the preflight record
    // Using generated Database types for full type safety
    const preflightData: Database['public']['Tables']['preflights']['Insert'] = {
        repo_url: normalizedUrl,
        owner,
        repo,
        default_branch: freshData.defaultBranch,
        repo_map: freshData.fileMap as any, // Json type - Supabase uses Json for complex objects
        stats: freshData.stats as any, // Json type
        fingerprint: freshData.fingerprint as any, // Json type
        is_private: freshData.isPrivate,
        fetch_strategy: freshData.isPrivate ? 'authenticated' : 'public',
        github_account_id: githubAccountId,
        installation_id: installationId || null,
        token_valid: true,
        user_id: userId,
        file_count: freshData.fileMap.length,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    // Try to upsert (update if exists, insert if not)
    let upsertQuery: any;

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

    // Step 5: Download/sync entire repository as archive (ONE API CALL)
    // CRITICAL: This is SYNCHRONOUS - we MUST wait for repo to be stored before returning
    // FAIL-FAST: If download/sync fails, the preflight fails
    if (newPreflight && typeof newPreflight === 'object' && 'id' in newPreflight) {
        const storageService = new RepoStorageService(supabase);

        // Check if repo already exists in storage
        const { data: existingRepo } = await supabase
            .from('repos')
            .select('repo_id')
            .eq('repo_id', (newPreflight as PreflightRecord).id)
            .single();

        if (existingRepo) {
            // Repo exists - sync with latest changes
            console.log(`🔄 [preflight-manager] Syncing existing repo archive for ${owner}/${repo}...`);

            const syncResult = await storageService.syncRepo(
                owner,
                repo,
                freshData.defaultBranch
                // SECURITY: Token now retrieved internally from github_account_id
            );

            if (!syncResult.synced) {
                console.error(`❌ [preflight-manager] Repo sync FAILED:`, syncResult.error);
                throw new Error(`Failed to sync repository: ${syncResult.error}`);
            }

            console.log(`✅ [preflight-manager] Repo synced: ${syncResult.changes} changes applied`);
        } else {
            // Repo doesn't exist - full download
            console.log(`📦 [preflight-manager] Downloading repo archive for ${owner}/${repo}...`);

            const result = await storageService.downloadAndStoreRepo(
                (newPreflight as PreflightRecord).id,
                owner,
                repo,
                freshData.defaultBranch
                // SECURITY: Token now retrieved internally from github_account_id
            );

            if (!result.success) {
                // FAIL-FAST: If we can't store the repo, fail the entire preflight
                console.error(`❌ [preflight-manager] Repo storage FAILED:`, result.error);
                throw new Error(`Failed to download repository: ${result.error}`);
            }

            console.log(`✅ [preflight-manager] Repo stored: ${result.fileCount} files, ${(result.archiveSize / 1024).toFixed(1)}KB`);
        }
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
    supabase: ReturnType<typeof createClient>,
    repoUrl: string,
    userId: string | null
): Promise<{ success: boolean; error?: string }> {

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        return { success: false, error: 'Invalid GitHub repository URL' };
    }

    const normalizedUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;

    const updateData: Database['public']['Tables']['preflights']['Update'] = {
        token_valid: false,
        updated_at: new Date().toISOString()
    };

    let query = supabase
        .from('preflights')
        .update(updateData)
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
        const authHeader = req.headers.get('authorization');

        // Get authenticated user ID (returns null if not authenticated)
        let userId: string | null = null;
        try {
            userId = await getAuthenticatedUserId(req, supabase);
        } catch {
            // User is not authenticated, userId remains null
        }

        const body: PreflightRequest = await req.json();
        const { action, repoUrl, forceRefresh, installationId } = body;
        // SECURITY: userToken removed - only use Authorization header


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
                    supabase as ReturnType<typeof createClient>,
                    repoUrl,
                    userId,
                    authHeader,
                    action === 'refresh' || forceRefresh,
                    installationId
                );
                break;

            case 'invalidate': {
                const invalidateResult = await invalidatePreflight(supabase as ReturnType<typeof createClient>, repoUrl, userId);
                response = invalidateResult.error ?
                    { success: invalidateResult.success, error: invalidateResult.error } :
                    { success: invalidateResult.success };
                break;
            }

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
