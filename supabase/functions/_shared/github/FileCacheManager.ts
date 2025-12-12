// ============================================================================
// File Cache Manager
// ============================================================================
// Handles ETag-based caching of GitHub file content to reduce API calls
// Implements conditional requests and cache expiration

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CacheResult {
  content: string;
  fromCache: boolean;
  etag?: string;
  size?: number;
}

export class FileCacheManager {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // ============================================================================
  // Core Caching Logic
  // ============================================================================

  /**
   * Fetch file content with ETag caching
   */
  async fetchFileWithCache(
    githubClient: any, // GitHubAPIClient or GitHubAppClient
    owner: string,
    repo: string,
    path: string,
    branch: string
  ): Promise<CacheResult> {
    // 1. Check cache first
    const cacheKey = { owner, repo, path, branch };
    const cached = await this.getCachedFile(cacheKey);

    if (cached) {
      // Try conditional request with ETag
      const conditionalResult = await this.tryConditionalRequest(
        githubClient, cacheKey, cached.etag
      );

      if (conditionalResult) {
        return conditionalResult;
      }

      // Not modified - return cached content
      return {
        content: cached.content,
        fromCache: true,
        etag: cached.etag,
        size: cached.size
      };
    }

    // 2. No cache - fetch fresh and cache it
    return await this.fetchAndCache(githubClient, cacheKey);
  }

  /**
   * Try conditional request with ETag
   */
  private async tryConditionalRequest(
    githubClient: any,
    cacheKey: { owner: string; repo: string; path: string; branch: string },
    etag: string
  ): Promise<CacheResult | null> {
    try {
      // Make conditional request
      const response = await githubClient.request(
        `/repos/${cacheKey.owner}/${cacheKey.repo}/contents/${cacheKey.path}?ref=${cacheKey.branch}`,
        {
          headers: { 'If-None-Match': etag }
        }
      );

      if (response.status === 304) {
        // Not modified - cache is still valid
        return null; // Caller will use cached content
      }

      if (response.ok) {
        // Content updated - cache new version
        const data = await response.json();
        const newEtag = response.headers.get('ETag') || response.headers.get('etag');

        await this.updateCache(cacheKey, data, newEtag);

        return {
          content: atob(data.content || ''),
          fromCache: false,
          etag: newEtag,
          size: data.size
        };
      }

      // Error response - fall back to cache if we have it
      console.warn(`Conditional request failed: ${response.status}`);
      return null;

    } catch (error) {
      console.warn('Conditional request error:', error);
      return null; // Fall back to cache
    }
  }

  /**
   * Fetch fresh content and cache it
   */
  private async fetchAndCache(
    githubClient: any,
    cacheKey: { owner: string; repo: string; path: string; branch: string }
  ): Promise<CacheResult> {
    const response = await githubClient.request(
      `/repos/${cacheKey.owner}/${cacheKey.repo}/contents/${cacheKey.path}?ref=${cacheKey.branch}`
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const etag = response.headers.get('ETag') || response.headers.get('etag');

    // Cache the result
    await this.updateCache(cacheKey, data, etag);

    return {
      content: atob(data.content || ''),
      fromCache: false,
      etag,
      size: data.size
    };
  }

  // ============================================================================
  // Cache Storage Operations
  // ============================================================================

  /**
   * Get cached file content
   */
  private async getCachedFile(
    cacheKey: { owner: string; repo: string; path: string; branch: string }
  ): Promise<{ content: string; etag: string; sha: string; size?: number } | null> {
    const { data, error } = await this.supabase
      .from('github_file_cache')
      .select('content, etag, content_sha, content_size')
      .eq('repo_owner', cacheKey.owner)
      .eq('repo_name', cacheKey.repo)
      .eq('file_path', cacheKey.path)
      .eq('branch', cacheKey.branch)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return null;
    }

    // Don't return content if it's too large (cache miss for large files)
    if (data.content_size && data.content_size > 1000000) { // 1MB limit
      return null;
    }

    return {
      content: data.content,
      etag: data.etag,
      sha: data.content_sha,
      size: data.content_size
    };
  }

  /**
   * Update cache with new content
   */
  private async updateCache(
    cacheKey: { owner: string; repo: string; path: string; branch: string },
    githubData: any,
    etag?: string | null
  ): Promise<void> {
    const content = githubData.content;
    const sha = githubData.sha;
    const size = githubData.size;

    // Skip caching if content is too large
    if (size && size > 1000000) { // 1MB limit
      console.log(`Skipping cache for large file: ${cacheKey.path} (${size} bytes)`);
      return;
    }

    // Decode content if it's base64
    let decodedContent = content;
    if (githubData.encoding === 'base64' && content) {
      try {
        decodedContent = atob(content.replace(/\n/g, ''));
      } catch (error) {
        console.warn('Failed to decode base64 content for caching');
        return;
      }
    }

    const { error } = await this.supabase
      .from('github_file_cache')
      .upsert({
        repo_owner: cacheKey.owner,
        repo_name: cacheKey.repo,
        file_path: cacheKey.path,
        branch: cacheKey.branch,
        content_sha: sha,
        etag: etag,
        content: decodedContent,
        content_size: size,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'repo_owner,repo_name,file_path,branch'
      });

    if (error) {
      console.warn('Failed to update file cache:', error);
    }
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Pre-warm cache for multiple files (useful for preflights)
   */
  async warmCache(
    githubClient: any,
    owner: string,
    repo: string,
    filePaths: string[],
    branch: string
  ): Promise<{ cached: number; failed: number }> {
    let cached = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);

      const promises = batch.map(async (path) => {
        try {
          await this.fetchFileWithCache(githubClient, owner, repo, path, branch);
          cached++;
        } catch (error) {
          console.warn(`Failed to cache ${path}:`, error);
          failed++;
        }
      });

      await Promise.all(promises);

      // Small delay between batches to be respectful to GitHub API
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { cached, failed };
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    const { data, error } = await this.supabase.rpc('cleanup_expired_file_cache');

    if (error) {
      console.warn('Failed to cleanup expired cache:', error);
      return 0;
    }

    return data || 0;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    total_entries: number;
    expired_entries: number;
    total_size_bytes: number;
    oldest_entry: string | null;
    newest_entry: string | null;
  }> {
    const { data, error } = await this.supabase
      .from('github_file_cache')
      .select('content_size, created_at, expires_at');

    if (error) {
      throw error;
    }

    const entries = data || [];
    const now = new Date();

    return {
      total_entries: entries.length,
      expired_entries: entries.filter(e => new Date(e.expires_at) < now).length,
      total_size_bytes: entries.reduce((sum, e) => sum + (e.content_size || 0), 0),
      oldest_entry: entries.length > 0 ? entries.reduce((oldest, e) =>
        e.created_at < oldest.created_at ? e : oldest
      ).created_at : null,
      newest_entry: entries.length > 0 ? entries.reduce((newest, e) =>
        e.created_at > newest.created_at ? e : newest
      ).created_at : null
    };
  }

  /**
   * Clear cache for a specific repository
   */
  async clearRepositoryCache(owner: string, repo: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('github_file_cache')
      .delete()
      .eq('repo_owner', owner)
      .eq('repo_name', repo);

    if (error) {
      console.warn('Failed to clear repository cache:', error);
      return 0;
    }

    return data?.length || 0;
  }
}