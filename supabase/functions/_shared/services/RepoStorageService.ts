/**
 * RepoStorageService - Handles compressed file storage in the repos table
 * 
 * This service manages the storage and retrieval of repository files,
 * enabling AI agents to read/write files without hitting GitHub rate limits.
 */

export interface StoredFile {
    filePath: string;
    content: string;
    contentHash: string;
    version: number;
    metadata?: Record<string, unknown>;
    previewCache?: Record<string, unknown>;
}

export interface FileToStore {
    path: string;
    content: string;
    metadata?: Record<string, unknown>;
}

/**
 * Compress content using gzip (Deno built-in CompressionStream)
 */
async function compressContent(content: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        }
    });

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const reader = compressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Combine all chunks into single Uint8Array
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

/**
 * Decompress gzip content (Deno built-in DecompressionStream)
 */
async function decompressContent(compressed: Uint8Array): Promise<string> {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(compressed);
            controller.close();
        }
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const reader = decompressedStream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    const decoder = new TextDecoder();
    return decoder.decode(result);
}

/**
 * Generate a simple hash for content change detection
 */
function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}


export class RepoStorageService {
    private supabase: any;

    constructor(supabase: any) {
        this.supabase = supabase;
    }

    /**
     * Store multiple files for a repository (compressed)
     */
    async storeRepoFiles(
        repoId: string,
        repoName: string,
        files: FileToStore[]
    ): Promise<{ stored: number; failed: number }> {
        let stored = 0;
        let failed = 0;

        // Process in batches of 50 to avoid overwhelming the database
        const batchSize = 50;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);

            const rows = await Promise.all(batch.map(async (file) => {
                try {
                    const compressed = await compressContent(file.content);

                    return {
                        repo_id: repoId,
                        repo_name: repoName,
                        file_path: file.path,
                        compressed_content: compressed,
                        content_hash: hashContent(file.content),
                        metadata: file.metadata || {},
                        version: 1,
                        last_accessed: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    };
                } catch (err) {
                    console.error(`Failed to compress file ${file.path}:`, err);
                    return null;
                }
            }));

            const validRows = rows.filter(Boolean);

            if (validRows.length > 0) {
                const { error } = await this.supabase
                    .from('repos')
                    .upsert(validRows, {
                        onConflict: 'repo_id,file_path',
                        ignoreDuplicates: false
                    });

                if (error) {
                    console.error(`Failed to store batch:`, error);
                    failed += validRows.length;
                } else {
                    stored += validRows.length;
                }
            }

            failed += batch.length - validRows.length;
        }

        console.log(`📦 RepoStorage: Stored ${stored}/${files.length} files, ${failed} failed`);
        return { stored, failed };
    }

    /**
     * Get a single file from the repos table (decompressed)
     */
    async getRepoFile(repoId: string, filePath: string): Promise<string | null> {
        const { data, error } = await this.supabase
            .from('repos')
            .select('compressed_content')
            .eq('repo_id', repoId)
            .eq('file_path', filePath)
            .single();

        if (error || !data) {
            return null;
        }

        try {
            // Update last_accessed
            await this.supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .eq('file_path', filePath);

            const decompressed = await decompressContent(new Uint8Array(data.compressed_content));
            return decompressed;
        } catch (err) {
            console.error(`Failed to decompress file ${filePath}:`, err);
            return null;
        }
    }

    /**
     * Get multiple files from the repos table (batch)
     */
    async getRepoFiles(repoId: string, filePaths: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();

        if (filePaths.length === 0) {
            return result;
        }

        const { data, error } = await this.supabase
            .from('repos')
            .select('file_path, compressed_content')
            .eq('repo_id', repoId)
            .in('file_path', filePaths);

        if (error || !data) {
            console.error('Failed to fetch files:', error);
            return result;
        }

        for (const row of data) {
            try {
                const decompressed = await decompressContent(new Uint8Array(row.compressed_content));
                result.set(row.file_path, decompressed);
            } catch (err) {
                console.error(`Failed to decompress ${row.file_path}:`, err);
            }
        }

        // Update last_accessed for all fetched files
        if (data.length > 0) {
            await this.supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .in('file_path', filePaths);
        }

        return result;
    }

    /**
     * Update a file (for AI edits) - increments version
     */
    async updateRepoFile(
        repoId: string,
        filePath: string,
        content: string,
        previewCache?: Record<string, unknown>
    ): Promise<boolean> {
        try {
            const compressed = await compressContent(content);

            const updateData: Record<string, unknown> = {
                compressed_content: compressed,
                content_hash: hashContent(content),
                last_updated: new Date().toISOString(),
                last_accessed: new Date().toISOString()
            };

            if (previewCache) {
                updateData['preview_cache'] = previewCache;
            }

            // Increment version using raw SQL
            const { error } = await this.supabase.rpc('increment_repo_file_version', {
                p_repo_id: repoId,
                p_file_path: filePath,
                p_compressed_content: compressed,
                p_content_hash: hashContent(content),
                p_preview_cache: previewCache || null
            });

            if (error) {
                // Fallback to simple update without version increment
                const { error: updateError } = await this.supabase
                    .from('repos')
                    .update(updateData)
                    .eq('repo_id', repoId)
                    .eq('file_path', filePath);

                if (updateError) {
                    console.error('Failed to update file:', updateError);
                    return false;
                }
            }

            return true;
        } catch (err) {
            console.error(`Failed to update file ${filePath}:`, err);
            return false;
        }
    }

    /**
     * Delete all files for a repository
     */
    async deleteRepoFiles(repoId: string): Promise<number> {
        const { data, error } = await this.supabase
            .from('repos')
            .delete()
            .eq('repo_id', repoId)
            .select('id');

        if (error) {
            console.error('Failed to delete repo files:', error);
            return 0;
        }

        return data?.length || 0;
    }

    /**
     * Check if files exist for a repository
     */
    async hasRepoFiles(repoId: string): Promise<boolean> {
        const { count, error } = await this.supabase
            .from('repos')
            .select('id', { count: 'exact', head: true })
            .eq('repo_id', repoId);

        if (error) {
            return false;
        }

        return (count || 0) > 0;
    }

    /**
     * Get file count for a repository
     */
    async getFileCount(repoId: string): Promise<number> {
        const { count, error } = await this.supabase
            .from('repos')
            .select('id', { count: 'exact', head: true })
            .eq('repo_id', repoId);

        if (error) {
            return 0;
        }

        return count || 0;
    }

    /**
     * Prefetch files from GitHub and store them
     * This is the main entry point called during preflight
     */
    async prefetchAndStoreFiles(
        repoId: string,
        repoName: string,
        fileMap: Array<{ path: string; size: number; type: string }>,
        githubClient: any,
        branch: string
    ): Promise<{ stored: number; failed: number; skipped: number }> {
        // Filter to only actual files (not summaries or directories)
        const filesToFetch = fileMap.filter(f =>
            f.type === 'file' &&
            !f.path.startsWith('[summary]') &&
            f.size < 500000 // Skip files larger than 500KB
        );

        console.log(`📥 Prefetching ${filesToFetch.length} files for ${repoName}...`);

        const skipped = fileMap.length - filesToFetch.length;
        const filesToStore: FileToStore[] = [];

        // Fetch files in parallel batches (5 at a time to avoid rate limits during prefetch)
        const batchSize = 5;
        for (let i = 0; i < filesToFetch.length; i += batchSize) {
            const batch = filesToFetch.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(async (file) => {
                    try {
                        const [owner, repo] = repoName.split('/');
                        const response = await githubClient.fetchFile(owner, repo, file.path, branch);
                        const data = await response.json();

                        if (data.content) {
                            // Decode base64 content from GitHub
                            const content = atob(data.content.replace(/\n/g, ''));
                            return { path: file.path, content };
                        }
                        return null;
                    } catch (err) {
                        console.warn(`Failed to fetch ${file.path}:`, err);
                        return null;
                    }
                })
            );

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    filesToStore.push(result.value);
                }
            }

            // Small delay between batches to be respectful to GitHub
            if (i + batchSize < filesToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Store all fetched files
        const storeResult = await this.storeRepoFiles(repoId, repoName, filesToStore);

        return {
            stored: storeResult.stored,
            failed: storeResult.failed + (filesToFetch.length - filesToStore.length),
            skipped
        };
    }
}
