/**
 * RepoStorageService - Archive-Based Repository Storage
 * 
 * Downloads entire repos as zipball in ONE API call.
 * Stores re-compressed archive with file index for fast lookup.
 * Agents read files by extracting from stored archive.
 */

// Using fflate for zip handling (lightweight, works in Deno)
import { unzipSync, zipSync, strToU8, strFromU8 } from 'https://esm.sh/fflate@0.8.2';

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

            // 6. Store metadata in DB
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
        // Fire and forget update
        this.supabase
            .from('repos')
            .update({ last_accessed: new Date().toISOString() })
            .eq('repo_id', repoId)
            .then(() => { });
    }

    // Pass-throughs for consistency
    async getFileIndex(repoId: string) {
        const { data } = await this.supabase.from('repos').select('file_index').eq('repo_id', repoId).single();
        return data?.file_index || null;
    }
}
