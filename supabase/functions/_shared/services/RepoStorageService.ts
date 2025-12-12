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

    constructor(supabase: any) {
        this.supabase = supabase;
    }

    /**
     * Download repo as zipball from GitHub and store in database
     * This is the main entry point - ONE API call for entire repo
     */
    async downloadAndStoreRepo(
        repoId: string,
        owner: string,
        repo: string,
        branch: string,
        githubToken?: string
    ): Promise<{ success: boolean; fileCount: number; archiveSize: number; error?: string }> {
        const repoName = `${owner}/${repo}`;
        console.log(`📦 Downloading zipball for ${repoName}@${branch}...`);

        try {
            // 1. Download zipball from GitHub (ONE API call)
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

            // 2. Get the zip data
            const zipBuffer = await response.arrayBuffer();
            const zipData = new Uint8Array(zipBuffer);
            console.log(`📥 Downloaded ${(zipData.length / 1024).toFixed(1)}KB zipball`);

            // 3. Unzip and build file index
            const unzipped = unzipSync(zipData);
            const fileIndex: Record<string, FileIndexEntry> = {};
            const cleanFiles: Record<string, Uint8Array> = {};

            // GitHub's zipball has a root folder like "owner-repo-sha/"
            // We need to strip that prefix
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
                // Skip directories (empty entries)
                if (rawPath.endsWith('/') || !content || content.length === 0) continue;

                // Strip the root prefix
                const cleanPath = rootPrefix ? rawPath.replace(rootPrefix, '') : rawPath;
                if (!cleanPath) continue;

                // Skip hidden files and common non-essential files
                if (cleanPath.startsWith('.git/')) continue;
                if (cleanPath.includes('node_modules/')) continue;

                // Build index entry
                fileIndex[cleanPath] = {
                    size: content.length,
                    hash: hashContent(content),
                    type: getFileType(cleanPath)
                };

                cleanFiles[cleanPath] = content;
                fileCount++;
            }

            console.log(`📋 Indexed ${fileCount} files`);

            // 4. Re-compress into our own clean zip
            const recompressed = zipSync(cleanFiles, { level: 6 });
            const archiveHash = hashContent(recompressed);

            console.log(`🗜️ Re-compressed: ${(recompressed.length / 1024).toFixed(1)}KB`);

            // 5. Store in database (upsert - one row per repo)
            const { error: dbError } = await this.supabase
                .from('repos')
                .upsert({
                    repo_id: repoId,
                    repo_name: repoName,
                    branch: branch,
                    archive_blob: recompressed,
                    archive_hash: archiveHash,
                    archive_size: recompressed.length,
                    file_index: fileIndex,
                    last_accessed: new Date().toISOString()
                }, {
                    onConflict: 'repo_id'
                });

            if (dbError) {
                console.error(`❌ Database storage failed:`, dbError);
                return {
                    success: false,
                    fileCount: 0,
                    archiveSize: 0,
                    error: dbError.message
                };
            }

            console.log(`✅ Stored ${repoName}: ${fileCount} files, ${(recompressed.length / 1024).toFixed(1)}KB`);

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
     * Get a single file from stored archive
     */
    async getRepoFile(repoId: string, filePath: string): Promise<string | null> {
        try {
            // Get archive and index
            const { data, error } = await this.supabase
                .from('repos')
                .select('archive_blob, file_index')
                .eq('repo_id', repoId)
                .single();

            if (error || !data?.archive_blob) {
                console.warn(`⚠️ Repo archive not found for ${repoId}`);
                return null;
            }

            // Check if file exists in index
            const index = data.file_index as Record<string, FileIndexEntry>;
            if (!index[filePath]) {
                console.warn(`⚠️ File not in index: ${filePath}`);
                return null;
            }

            // Unzip and extract specific file
            const archiveData = new Uint8Array(data.archive_blob);
            const unzipped = unzipSync(archiveData);

            if (!unzipped[filePath]) {
                console.warn(`⚠️ File not in archive: ${filePath}`);
                return null;
            }

            // Convert to string
            const content = strFromU8(unzipped[filePath]);

            // Update last_accessed (fire and forget)
            this.supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .then(() => { });

            return content;

        } catch (err) {
            console.error(`❌ Error extracting file ${filePath}:`, err);
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
            const { data, error } = await this.supabase
                .from('repos')
                .select('archive_blob, file_index')
                .eq('repo_id', repoId)
                .single();

            if (error || !data?.archive_blob) {
                return result;
            }

            // Unzip once, extract multiple files
            const archiveData = new Uint8Array(data.archive_blob);
            const unzipped = unzipSync(archiveData);

            for (const path of filePaths) {
                if (unzipped[path]) {
                    result.set(path, strFromU8(unzipped[path]));
                }
            }

            // Update last_accessed
            this.supabase
                .from('repos')
                .update({ last_accessed: new Date().toISOString() })
                .eq('repo_id', repoId)
                .then(() => { });

            return result;

        } catch (err) {
            console.error(`❌ Error extracting files:`, err);
            return result;
        }
    }

    /**
     * Get the file index (list of all files) for a repo
     */
    async getFileIndex(repoId: string): Promise<Record<string, FileIndexEntry> | null> {
        const { data, error } = await this.supabase
            .from('repos')
            .select('file_index')
            .eq('repo_id', repoId)
            .single();

        if (error || !data) return null;
        return data.file_index;
    }

    /**
     * Check if repo archive exists
     */
    async hasRepo(repoId: string): Promise<boolean> {
        const { count, error } = await this.supabase
            .from('repos')
            .select('id', { count: 'exact', head: true })
            .eq('repo_id', repoId);

        return !error && (count || 0) > 0;
    }

    /**
     * Delete repo archive
     */
    async deleteRepo(repoId: string): Promise<boolean> {
        const { error } = await this.supabase
            .from('repos')
            .delete()
            .eq('repo_id', repoId);

        return !error;
    }

    /**
     * Update a file in the archive (for AI fixes)
     * Re-compresses the entire archive with the updated file
     */
    async updateRepoFile(
        repoId: string,
        filePath: string,
        newContent: string
    ): Promise<boolean> {
        try {
            // Get current archive
            const { data, error } = await this.supabase
                .from('repos')
                .select('archive_blob, file_index, repo_name, branch')
                .eq('repo_id', repoId)
                .single();

            if (error || !data?.archive_blob) {
                return false;
            }

            // Unzip
            const archiveData = new Uint8Array(data.archive_blob);
            const unzipped = unzipSync(archiveData);

            // Update the file
            const contentBytes = strToU8(newContent);
            unzipped[filePath] = contentBytes;

            // Update index
            const index = data.file_index as Record<string, FileIndexEntry>;
            index[filePath] = {
                size: contentBytes.length,
                hash: hashContent(contentBytes),
                type: getFileType(filePath)
            };

            // Re-compress
            const recompressed = zipSync(unzipped, { level: 6 });

            // Save
            const { error: updateError } = await this.supabase
                .from('repos')
                .update({
                    archive_blob: recompressed,
                    archive_hash: hashContent(recompressed),
                    archive_size: recompressed.length,
                    file_index: index,
                    last_accessed: new Date().toISOString()
                })
                .eq('repo_id', repoId);

            return !updateError;

        } catch (err) {
            console.error(`❌ Error updating file ${filePath}:`, err);
            return false;
        }
    }
}
