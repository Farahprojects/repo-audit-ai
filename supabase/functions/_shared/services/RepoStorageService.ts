/**
 * RepoStorageService - Archive-Based Repository Storage
 * 
 * Downloads entire repos as zipball in ONE API call.
 * Stores re-compressed archive with file index for fast lookup.
 * Agents read files by extracting from stored archive.
 */

// Using fflate for zip handling (lightweight, works in Deno)
import { unzipSync, zipSync, strToU8, strFromU8 } from 'https://esm.sh/fflate@0.8.2';
import { ErrorTrackingService } from './ErrorTrackingService.ts';
import { GitHubAPIClient } from '../github/GitHubAPIClient.ts';

export interface FileIndexEntry {
    size: number;
    hash: string;
    type: string; // file extension or 'unknown'
}

export interface RepoArchive {
    repoId: string;
    repoName: string;
    branch: string;
    archiveBlob: Uint8Array;
    archiveHash: string;
    archiveSize: number;
    fileIndex: Record<string, FileIndexEntry>;
}

/**
 * Generate simple hash for content
 */
function hashContent(content: Uint8Array): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content[i]!;
        hash = hash & hash;
    }
    return hash.toString(16);
}

/**
 * Get file type from path
 */
function getFileType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    return ext || 'unknown';
}

export class RepoStorageService {
    private supabase: any;
    private readonly BUCKET_NAME = 'repo_archives';

    constructor(supabase: any) {
        this.supabase = supabase;
    }

    /**
     * Download repo as zipball from GitHub and upload to Supabase Storage
     * Stores metadata and file index in Postgres
     */
    async downloadAndStoreRepo(
        repoId: string,
        owner: string,
        repo: string,
        branch: string,
        githubToken?: string
    ): Promise<{ success: boolean; fileCount: number; archiveSize: number; error?: string }> {
        const repoName = `${owner}/${repo}`;
        const startTime = Date.now();
        console.log(`📦 Downloading zipball for ${repoName}@${branch}...`);

        try {
            // 1. Download zipball from GitHub
            const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'RepoAudit'
            };
            if (githubToken) {
                headers['Authorization'] = `Bearer ${githubToken}`;
            }

            const response = await fetch(zipUrl, { headers });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ GitHub zipball download failed: ${response.status}`, errorText);
                ErrorTrackingService.trackError(
                    new Error(`GitHub zipball download failed: ${response.status}`),
                    {
                        component: 'RepoStorageService',
                        operation: 'downloadRepo',
                        statusCode: response.status,
                        repoId
                    }
                );
                return {
                    success: false,
                    fileCount: 0,
                    archiveSize: 0,
                    error: `GitHub API error: ${response.status}`
                };
            }

            // 2. Process zip data (Memory intensive, but necessary to build index)
            const zipBuffer = await response.arrayBuffer();
            const zipData = new Uint8Array(zipBuffer);
            console.log(`📥 Downloaded ${(zipData.length / 1024).toFixed(1)}KB from GitHub`);

            // 3. Unzip and build file index
            const unzipped = unzipSync(zipData);
            const fileIndex: Record<string, FileIndexEntry> = {};
            const cleanFiles: Record<string, Uint8Array> = {};

            // Strip root folder
            let rootPrefix = '';
            const unzippedTyped = unzipped as Record<string, Uint8Array>;
            for (const path of Object.keys(unzippedTyped)) {
                if (path.endsWith('/')) {
                    rootPrefix = path;
                    break;
                }
            }

            let fileCount = 0;
            for (const [rawPath, content] of Object.entries(unzippedTyped)) {
                if (rawPath.endsWith('/') || !content || content.length === 0) continue;

                // Strip root
                const cleanPath = rootPrefix ? rawPath.replace(rootPrefix, '') : rawPath;
                if (!cleanPath) continue;

                // Filter ignores
                if (cleanPath.startsWith('.git/')) continue;
                if (cleanPath.includes('node_modules/')) continue;

                // Index
                fileIndex[cleanPath] = {
                    size: content.length,
                    hash: hashContent(content),
                    type: getFileType(cleanPath)
                };

                cleanFiles[cleanPath] = content;
                fileCount++;
            }

            // 4. Re-compress
            const recompressed = zipSync(cleanFiles, { level: 6 });
            const archiveHash = hashContent(recompressed);
            console.log(`🗜️ Re-compressed: ${(recompressed.length / 1024).toFixed(1)}KB`);

            // 5. Upload to Supabase Storage
            const storagePath = `${repoId}/archive.zip`;
            const { error: uploadError } = await this.supabase.storage
                .from(this.BUCKET_NAME)
                .upload(storagePath, recompressed, {
                    contentType: 'application/zip',
                    upsert: true
                });

            if (uploadError) {
                console.error(`❌ Storage upload failed:`, uploadError);
                return { success: false, fileCount: 0, archiveSize: 0, error: uploadError.message };
            }

            // 6. Get latest commit SHA from GitHub
            let commitSha: string | undefined;
            try {
                const githubClient = new GitHubAPIClient(githubToken);
                const latestCommit = await githubClient.getLatestCommit(owner, repo, branch);
                commitSha = latestCommit.sha;
            } catch (error) {
                console.warn(`⚠️ Could not fetch commit SHA for ${repoName}:`, error);
                // Continue without commit SHA - sync will handle this later
            }

            // 7. Store metadata in DB
            const { error: dbError } = await this.supabase
                .from('repos')
                .upsert({
                    repo_id: repoId,
                    repo_name: repoName,
                    branch: branch,
                    storage_path: storagePath, // Storing PATH, not BLOB
                    archive_hash: archiveHash,
                    archive_size: recompressed.length,
                    file_index: fileIndex,
                    commit_sha: commitSha,
                    last_updated: new Date().toISOString()
                }, {
                    onConflict: 'repo_id'
                });

            if (dbError) {
                console.error(`❌ Database metadata insert failed:`, dbError);
                // Try to cleanup storage? (Optional)
                return { success: false, fileCount: 0, archiveSize: 0, error: dbError.message };
            }

            console.log(`✅ Stored ${repoName}: ${fileCount} files in Storage (${storagePath}) in ${Date.now() - startTime}ms`);

            return {
                success: true,
                fileCount,
                archiveSize: recompressed.length
            };

        } catch (err) {
            console.error(`❌ Error downloading/storing repo:`, err);
            return {
                success: false,
                fileCount: 0,
                archiveSize: 0,
                error: err instanceof Error ? err.message : String(err)
            };
        }
    }

    /**
     * Helper: Download archive from Storage
     */
    private async fetchArchiveFromStorage(storagePath: string): Promise<Uint8Array | null> {
        const { data, error } = await this.supabase.storage
            .from(this.BUCKET_NAME)
            .download(storagePath);

        if (error || !data) {
            console.warn(`⚠️ Failed to download archive from storage: ${storagePath}`, error);
            return null;
        }

        return new Uint8Array(await data.arrayBuffer());
    }

    /**
     * Get a single file from stored archive
     */
    async getRepoFile(repoId: string, filePath: string): Promise<string | null> {
        try {
            // Get storage path from DB meta
            const { data: repoMeta, error } = await this.supabase
                .from('repos')
                .select('storage_path, file_index')
                .eq('repo_id', repoId)
                .single();

            if (error || !repoMeta?.storage_path) {
                console.warn(`⚠️ Repo metadata not found for ${repoId}`);
                return null;
            }

            // Check index first
            const index = repoMeta.file_index as Record<string, FileIndexEntry>;
            if (!index[filePath]) {
                return null; // File doesn't exist
            }

            // Download archive
            const archiveData = await this.fetchArchiveFromStorage(repoMeta.storage_path);
            if (!archiveData) return null;

            // Unzip
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            if (!unzipped[filePath]) return null;

            // Mark accessed
            this.touchRepo(repoId);

            return strFromU8(unzipped[filePath]);

        } catch (err) {
            console.error(`❌ Error retrieving file ${filePath}:`, err);
            ErrorTrackingService.trackError(
                err instanceof Error ? err : new Error(String(err)),
                {
                    component: 'RepoStorageService',
                    operation: 'getRepoFile',
                    filePath,
                    repoId
                }
            );
            return null;
        }
    }

    /**
     * Get multiple files from stored archive (batch)
     */
    async getRepoFiles(repoId: string, filePaths: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        if (filePaths.length === 0) return result;

        try {
            // Get storage path
            const { data: repoMeta, error } = await this.supabase
                .from('repos')
                .select('storage_path')
                .eq('repo_id', repoId)
                .single();

            if (error || !repoMeta?.storage_path) return result;

            // Download archive
            const archiveData = await this.fetchArchiveFromStorage(repoMeta.storage_path);
            if (!archiveData) return result;

            // Unzip
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            for (const path of filePaths) {
                if (unzipped[path]) {
                    result.set(path, strFromU8(unzipped[path]));
                }
            }

            this.touchRepo(repoId);
            return result;

        } catch (err) {
            console.error(`❌ Error retrieving files batch:`, err);
            return result;
        }
    }

    /**
     * Update a file in the archive (for AI fixes)
     */
    async updateRepoFile(
        repoId: string,
        filePath: string,
        newContent: string
    ): Promise<boolean> {
        try {
            // Get current meta
            const { data: repoMeta, error } = await this.supabase
                .from('repos')
                .select('storage_path, file_index')
                .eq('repo_id', repoId)
                .single();

            if (error || !repoMeta?.storage_path) return false;

            // Download
            const archiveData = await this.fetchArchiveFromStorage(repoMeta.storage_path);
            if (!archiveData) return false;

            // Unzip
            const unzipped = unzipSync(archiveData) as Record<string, Uint8Array>;

            // Update file in memory
            const contentBytes = strToU8(newContent);
            unzipped[filePath] = contentBytes;

            // Update index
            const index = repoMeta.file_index as Record<string, FileIndexEntry>;
            index[filePath] = {
                size: contentBytes.length,
                hash: hashContent(contentBytes),
                type: getFileType(filePath)
            };

            // Re-compress
            const recompressed = zipSync(unzipped, { level: 6 });

            // Upload back to Storage
            const { error: uploadError } = await this.supabase.storage
                .from(this.BUCKET_NAME)
                .upload(repoMeta.storage_path, recompressed, {
                    contentType: 'application/zip',
                    upsert: true
                });

            if (uploadError) return false;

            // Update DB meta
            await this.supabase
                .from('repos')
                .update({
                    archive_hash: hashContent(recompressed),
                    archive_size: recompressed.length,
                    file_index: index,
                    last_updated: new Date().toISOString()
                })
                .eq('repo_id', repoId);

            return true;

        } catch (err) {
            console.error(`❌ Error updating file ${filePath}:`, err);
            return false;
        }
    }

    private async touchRepo(repoId: string) {
        // Throttle updates to avoid excessive database writes
        // Only update if we haven't updated this repo in the last 5 minutes
        const now = Date.now();
        const lastUpdateKey = `last_accessed_${repoId}`;
        const lastUpdate = (this as any)[lastUpdateKey] || 0;
        const timeSinceLastUpdate = now - lastUpdate;

        // Only update if it's been more than 5 minutes (300,000 ms)
        if (timeSinceLastUpdate > 300000) {
            (this as any)[lastUpdateKey] = now;

            // Fire and forget update
            this.supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .then(() => { });
        }
    }

    // Pass-throughs for consistency
    async getFileIndex(repoId: string) {
        const { data } = await this.supabase.from('repos').select('file_index').eq('repo_id', repoId).single();
        return data?.file_index || null;
    }

    /**
     * Batch update multiple files in a repository archive
     * More efficient than calling updateRepoFile() in a loop
     */
    async patchRepoFiles(
        repoId: string,
        changes: { path: string; content: string | null }[] // null = delete
    ): Promise<boolean> {
        try {
            // Get current archive
            const currentArchive = await this.fetchArchiveFromStorage(`repos/${repoId}.zip`);
            if (!currentArchive) {
                throw new Error(`Repository archive not found: ${repoId}`);
            }

            // Unzip current archive
            const unzipped = unzipSync(currentArchive);
            const fileIndex: Record<string, FileIndexEntry> = {};

            // Apply changes
            for (const change of changes) {
                const { path, content } = change;

                if (content === null) {
                    // Delete file
                    delete unzipped[path];
                } else {
                    // Add/update file
                    unzipped[path] = strToU8(content);
                }
            }

            // Build new file index
            for (const [path, content] of Object.entries(unzipped)) {
                if (path.startsWith('.')) continue; // Skip hidden files

                fileIndex[path] = {
                    size: content.length,
                    hash: hashContent(content),
                    type: getFileType(path)
                };
            }

            // Re-zip and upload
            const newArchive = zipSync(unzipped, { level: 6 });
            const archiveHash = hashContent(newArchive);

            const { error: uploadError } = await this.supabase.storage
                .from('repo_archives')
                .update(`repos/${repoId}.zip`, newArchive, {
                    contentType: 'application/zip',
                    upsert: true
                });

            if (uploadError) {
                throw uploadError;
            }

            // Update database with new index and archive info
            const { error: updateError } = await this.supabase
                .from('repos')
                .update({
                    file_index: fileIndex,
                    archive_hash: archiveHash,
                    archive_size: newArchive.length,
                    updated_at: new Date().toISOString()
                })
                .eq('repo_id', repoId);

            if (updateError) {
                throw updateError;
            }

            return true;
        } catch (error) {
            ErrorTrackingService.trackError(error as Error, {
                component: 'RepoStorageService',
                function: 'patchRepoFiles',
                repoId
            });
            return false;
        }
    }

    /**
     * Sync repository with latest changes from GitHub
     * Only downloads and applies changes since last sync
     */
    async syncRepo(repoId: string, owner: string, repo: string, branch: string, token?: string): Promise<{
        synced: boolean;
        changes: number;
        error?: string;
    }> {
        try {
            // 1. Get current stored commit_sha from repos table
            const { data: repoData, error: repoError } = await this.supabase
                .from('repos')
                .select('commit_sha')
                .eq('repo_id', repoId)
                .single();

            if (repoError) {
                throw new Error(`Failed to get repo data: ${repoError.message}`);
            }

            const storedCommitSha = repoData?.commit_sha;

            // 2. Get latest HEAD sha from GitHub
            const githubClient = new GitHubAPIClient(token);
            const latestCommit = await githubClient.getLatestCommit(owner, repo, branch);
            const latestSha = latestCommit.sha;

            // 3. If same → return early (no changes)
            if (storedCommitSha === latestSha) {
                return { synced: false, changes: 0 };
            }

            // 4. If different → call GitHub Compare API
            const comparison = await githubClient.compareCommits(owner, repo, storedCommitSha || latestSha, latestSha);

            if (!comparison.files || comparison.files.length === 0) {
                // No file changes, just update commit SHA
                await this.supabase
                    .from('repos')
                    .update({ commit_sha: latestSha })
                    .eq('repo_id', repoId);
                return { synced: true, changes: 0 };
            }

            // 5. For each changed file: fetch content or mark for deletion
            const changes: { path: string; content: string | null }[] = [];

            for (const file of comparison.files) {
                const { filename, status } = file;

                if (status === 'removed') {
                    // File was deleted
                    changes.push({ path: filename, content: null });
                } else {
                    // File was added or modified - fetch content
                    try {
                        const fileData = await githubClient.getFileContent(owner, repo, filename, branch);
                        const content = typeof fileData.content === 'string'
                            ? atob(fileData.content.replace(/\n/g, ''))
                            : '';
                        changes.push({ path: filename, content });
                    } catch (error) {
                        console.warn(`Failed to fetch ${filename}:`, error);
                        // Skip this file, continue with others
                    }
                }
            }

            // 6. Apply all changes in batch
            const success = await this.patchRepoFiles(repoId, changes);

            if (!success) {
                throw new Error('Failed to apply changes to repository archive');
            }

            // 7. Update commit_sha in repos table
            const { error: updateError } = await this.supabase
                .from('repos')
                .update({
                    commit_sha: latestSha,
                    updated_at: new Date().toISOString()
                })
                .eq('repo_id', repoId);

            if (updateError) {
                throw updateError;
            }

            return { synced: true, changes: changes.length };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            ErrorTrackingService.trackError(error as Error, {
                component: 'RepoStorageService',
                function: 'syncRepo',
                repoId,
                owner,
                repo,
                branch
            });

            return { synced: false, changes: 0, error: errorMessage };
        }
    }
}
