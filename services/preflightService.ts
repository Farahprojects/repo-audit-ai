/**
 * Preflight Service
 * 
 * Client-side service for managing preflight records.
 * Preflights are persistent snapshots of repository metadata that serve as
 * the single source of truth for all audit operations.
 * 
 * Key Benefits:
 * - Agents never need to guess repo state
 * - Multiple audits can reuse the same preflight
 * - Token validation is centralized
 * - Deterministic, stable audit behavior
 */

import { supabase } from '../src/integrations/supabase/client';
import { AuditStats, ComplexityFingerprint } from '../types';
import { ErrorLogger } from './errorService';

// Types

export interface FileMapItem {
    path: string;
    size: number;
    type: string;
}

export interface PreflightRecord {
    id: string;
    repo_url: string;
    owner: string;
    repo: string;
    default_branch: string;
    repo_map: FileMapItem[];
    stats: AuditStats;
    fingerprint: ComplexityFingerprint;
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

export interface PreflightResponse {
    success: boolean;
    preflight?: PreflightRecord;
    source?: 'cache' | 'fresh';
    error?: string;
    errorCode?: string;
    requiresAuth?: boolean;
}

export type PreflightAction = 'get' | 'create' | 'refresh' | 'invalidate';

/**
 * Preflight Service Class
 * 
 * Manages preflight records through the preflight-manager edge function.
 */
export class PreflightService {

    /**
     * Get or create a preflight record for a repository.
     * 
     * This is the main entry point for preflight operations.
     * It will:
     * 1. Check for an existing valid cached preflight
     * 2. If not found or expired, fetch fresh data from GitHub
     * 3. Store the preflight in the database
     * 4. Return the preflight record
     * 
     * @param repoUrl - Full GitHub repository URL
     * @param options - Optional configuration
     * @returns PreflightResponse with preflight data or error
     */
    static async getOrCreate(
        repoUrl: string,
        options: {
            forceRefresh?: boolean;
            userToken?: string;
        } = {}
    ): Promise<PreflightResponse> {
        const action: PreflightAction = options.forceRefresh ? 'refresh' : 'get';

        ErrorLogger.info('Fetching preflight', { repoUrl, action, hasToken: !!options.userToken });

        try {
            const { data, error } = await supabase.functions.invoke('preflight-manager', {
                body: {
                    action,
                    repoUrl,
                    forceRefresh: options.forceRefresh,
                    userToken: options.userToken
                }
            });

            if (error) {
                ErrorLogger.error('Preflight service error', error, { repoUrl, action });
                return {
                    success: false,
                    error: error.message || 'Failed to fetch preflight',
                    errorCode: 'SERVICE_ERROR'
                };
            }

            // The edge function returns a PreflightResponse directly
            const response = data as PreflightResponse;

            if (response.success) {
                ErrorLogger.info('Preflight fetched successfully', {
                    repoUrl,
                    source: response.source,
                    fileCount: response.preflight?.file_count,
                    isPrivate: response.preflight?.is_private
                });
            } else {
                ErrorLogger.warn('Preflight fetch failed', undefined, {
                    repoUrl,
                    error: response.error,
                    errorCode: response.errorCode
                });
            }

            return response;

        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown preflight error');
            ErrorLogger.error('Unexpected preflight error', error, { repoUrl });

            return {
                success: false,
                error: error.message,
                errorCode: 'UNEXPECTED_ERROR'
            };
        }
    }

    /**
     * Force refresh a preflight record.
     * 
     * Use this when you know the cached data might be stale,
     * e.g., after a user reconnects their GitHub account.
     */
    static async refresh(repoUrl: string, userToken?: string): Promise<PreflightResponse> {
        return this.getOrCreate(repoUrl, { forceRefresh: true, userToken });
    }

    /**
     * Invalidate a preflight record.
     * 
     * Marks the token as invalid, forcing a refresh on next access.
     * Use this when you detect that a GitHub token has expired.
     */
    static async invalidate(repoUrl: string): Promise<{ success: boolean; error?: string }> {
        ErrorLogger.info('Invalidating preflight', { repoUrl });

        try {
            const { data, error } = await supabase.functions.invoke('preflight-manager', {
                body: {
                    action: 'invalidate',
                    repoUrl
                }
            });

            if (error) {
                ErrorLogger.error('Preflight invalidation error', error, { repoUrl });
                return { success: false, error: error.message };
            }

            return data as { success: boolean; error?: string };

        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if a preflight error indicates that GitHub authentication is required.
     * 
     * @param response - PreflightResponse from getOrCreate
     * @returns true if the user needs to connect their GitHub account
     */
    static requiresGitHubAuth(response: PreflightResponse): boolean {
        if (response.success) return false;

        return Boolean(response.requiresAuth) ||
            response.errorCode === 'PRIVATE_REPO' ||
            Boolean(response.error?.includes('PRIVATE_REPO'));
    }

    /**
     * Convert a preflight record to the format expected by the audit flow.
     * 
     * This provides a clean interface between the preflight system and
     * the existing audit infrastructure.
     */
    static toAuditContext(preflight: PreflightRecord): {
        stats: AuditStats;
        fingerprint: ComplexityFingerprint;
        fileMap: FileMapItem[];
        repoUrl: string;
        isPrivate: boolean;
        fetchStrategy: 'public' | 'authenticated';
    } {
        return {
            stats: {
                ...preflight.stats,
                fingerprint: preflight.fingerprint
            },
            fingerprint: preflight.fingerprint,
            fileMap: preflight.repo_map,
            repoUrl: preflight.repo_url,
            isPrivate: preflight.is_private,
            fetchStrategy: preflight.fetch_strategy
        };
    }

    /**
     * Get recent preflights for a user (for dashboard display).
     * 
     * Note: The 'preflights' table needs to be added to Supabase types after migration.
     * Until then, we use type assertion to bypass type checking.
     */
    static async getRecentPreflights(limit: number = 10): Promise<PreflightRecord[]> {
        try {
            // Use type assertion to bypass the missing table type
            // After running migration, regenerate types with: npx supabase gen types typescript
            const { data, error } = await (supabase as any)
                .from('preflights')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(limit);

            if (error) {
                ErrorLogger.error('Failed to fetch recent preflights', error);
                return [];
            }

            return (data || []) as PreflightRecord[];

        } catch (err) {
            ErrorLogger.error('Unexpected error fetching preflights', err instanceof Error ? err : new Error('Unknown'));
            return [];
        }
    }
}

/**
 * Convenience function for common preflight operations.
 * 
 * Usage:
 * ```typescript
 * const result = await fetchPreflight(repoUrl);
 * if (result.success) {
 *   const { stats, fileMap } = result.preflight;
 *   // Start audit...
 * } else if (PreflightService.requiresGitHubAuth(result)) {
 *   // Show GitHub connect modal
 * } else {
 *   // Show error
 * }
 * ```
 */
/**
 * Find existing preflight for a repo URL without creating new ones
 * Used by the dashboard to skip preflight step for repos that already have data
 */
export async function findExistingPreflight(repoUrl: string): Promise<PreflightRecord | null> {
    try {
        ErrorLogger.info('Finding existing preflight', { repoUrl });

        const { data, error } = await supabase
            .from('preflights')
            .select('*')
            .eq('repo_url', repoUrl)
            .gt('expires_at', new Date().toISOString()) // Only valid (non-expired) preflights
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows returned
                ErrorLogger.info('No existing preflight found', { repoUrl });
                return null;
            }
            throw error;
        }

        ErrorLogger.info('Found existing preflight', { repoUrl, preflightId: data.id });
        return data as unknown as PreflightRecord;
    } catch (error) {
        ErrorLogger.error('Failed to find existing preflight', error instanceof Error ? error : new Error('Unknown error'), { repoUrl });
        return null;
    }
}

export async function fetchPreflight(
    repoUrl: string,
    options?: { forceRefresh?: boolean; userToken?: string }
): Promise<PreflightResponse> {
    return PreflightService.getOrCreate(repoUrl, options);
}
