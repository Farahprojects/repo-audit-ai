// Chunking utilities for multi-agent audit system
// Splits large repos into manageable chunks for worker agents

export interface FileInfo {
    path: string;
    content: string;
    tokens: number;
}

export interface Chunk {
    id: string;
    name: string;
    files: FileInfo[];
    totalTokens: number;
    priority: number; // Higher = more important
}

// Import shared token estimation
import { estimateTokens } from './utils.ts';

// Group files by top-level folder
function groupByFolder(files: FileInfo[]): Map<string, FileInfo[]> {
    const folders = new Map<string, FileInfo[]>();

    for (const file of files) {
        // Extract top-level folder (e.g., "src" from "src/components/Button.tsx")
        const parts = file.path.split('/');
        const folder = (parts.length > 1 ? parts[0] : '_root') || '_root';

        if (!folders.has(folder)) {
            folders.set(folder, []);
        }
        const fileList = folders.get(folder);
        if (fileList) {
            fileList.push(file);
        }
    }

    return folders;
}

// Calculate folder priority based on audit importance
function getFolderPriority(folderName: string): number {
    const priorities: Record<string, number> = {
        'src': 10,
        'app': 10,
        'lib': 9,
        'api': 9,
        'pages': 8,
        'components': 8,
        'services': 8,
        'hooks': 7,
        'utils': 7,
        'helpers': 7,
        'supabase': 9,
        'functions': 9,
        'server': 9,
        'auth': 10,
        'middleware': 8,
        'config': 6,
        'types': 5,
        'styles': 3,
        'public': 2,
        'assets': 2,
        'tests': 4,
        '__tests__': 4,
        'test': 4,
        'docs': 1,
        '_root': 5,
    };

    return priorities[folderName.toLowerCase()] || 5;
}

// Split a large folder into smaller sub-chunks
function splitLargeFolder(
    folderName: string,
    files: FileInfo[],
    maxTokens: number
): Chunk[] {
    const chunks: Chunk[] = [];
    let currentChunk: FileInfo[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;

    // Sort files by size (smaller first) for better packing
    const sortedFiles = [...files].sort((a, b) => a.tokens - b.tokens);

    for (const file of sortedFiles) {
        if (currentTokens + file.tokens > maxTokens && currentChunk.length > 0) {
            // Save current chunk and start new one
            chunks.push({
                id: `${folderName}-${chunkIndex}`,
                name: `${folderName} (part ${chunkIndex + 1})`,
                files: currentChunk,
                totalTokens: currentTokens,
                priority: getFolderPriority(folderName),
            });
            currentChunk = [];
            currentTokens = 0;
            chunkIndex++;
        }

        currentChunk.push(file);
        currentTokens += file.tokens;
    }

    // Don't forget the last chunk
    if (currentChunk.length > 0) {
        chunks.push({
            id: `${folderName}-${chunkIndex}`,
            name: chunkIndex > 0 ? `${folderName} (part ${chunkIndex + 1})` : folderName,
            files: currentChunk,
            totalTokens: currentTokens,
            priority: getFolderPriority(folderName),
        });
    }

    return chunks;
}

// Merge small folders together
function mergeSmallFolders(
    smallFolders: Array<{ name: string; files: FileInfo[]; tokens: number }>,
    maxTokens: number
): Chunk[] {
    const chunks: Chunk[] = [];
    let currentFiles: FileInfo[] = [];
    let currentNames: string[] = [];
    let currentTokens = 0;
    let chunkIndex = 0;

    for (const folder of smallFolders) {
        if (currentTokens + folder.tokens > maxTokens && currentFiles.length > 0) {
            chunks.push({
                id: `misc-${chunkIndex}`,
                name: currentNames.join(' + '),
                files: currentFiles,
                totalTokens: currentTokens,
                priority: 4, // Lower priority for misc bundles
            });
            currentFiles = [];
            currentNames = [];
            currentTokens = 0;
            chunkIndex++;
        }

        currentFiles.push(...folder.files);
        currentNames.push(folder.name);
        currentTokens += folder.tokens;
    }

    if (currentFiles.length > 0) {
        chunks.push({
            id: `misc-${chunkIndex}`,
            name: currentNames.join(' + '),
            files: currentFiles,
            totalTokens: currentTokens,
            priority: 4,
        });
    }

    return chunks;
}

/**
 * Main chunking function
 * Splits repo files into chunks suitable for parallel worker processing
 * 
 * @param files - Array of file info with content
 * @param maxTokensPerChunk - Maximum tokens per chunk (default 500k)
 * @param minTokensToMerge - Threshold below which folders get merged (default 50k)
 */
export function createChunks(
    files: Array<{ path: string; content: string }>,
    maxTokensPerChunk: number = 500000,
    minTokensToMerge: number = 50000
): Chunk[] {
    // Add token estimates
    const filesWithTokens: FileInfo[] = files.map(f => ({
        ...f,
        tokens: estimateTokens(f.content),
    }));

    const totalTokens = filesWithTokens.reduce((sum, f) => sum + f.tokens, 0);

    // If total is small enough, return single chunk
    if (totalTokens <= maxTokensPerChunk) {
        return [{
            id: 'all',
            name: 'Full Repository',
            files: filesWithTokens,
            totalTokens,
            priority: 10,
        }];
    }

    // Group by folder
    const folders = groupByFolder(filesWithTokens);
    const chunks: Chunk[] = [];
    const smallFolders: Array<{ name: string; files: FileInfo[]; tokens: number }> = [];

    for (const [folderName, folderFiles] of folders) {
        const folderTokens = folderFiles.reduce((sum, f) => sum + f.tokens, 0);

        if (folderTokens > maxTokensPerChunk) {
            // Large folder: split it
            chunks.push(...splitLargeFolder(folderName, folderFiles, maxTokensPerChunk));
        } else if (folderTokens < minTokensToMerge) {
            // Small folder: queue for merging
            smallFolders.push({ name: folderName, files: folderFiles, tokens: folderTokens });
        } else {
            // Medium folder: keep as single chunk
            chunks.push({
                id: folderName,
                name: folderName,
                files: folderFiles,
                totalTokens: folderTokens,
                priority: getFolderPriority(folderName),
            });
        }
    }

    // Merge small folders
    if (smallFolders.length > 0) {
        chunks.push(...mergeSmallFolders(smallFolders, maxTokensPerChunk));
    }

    // Sort by priority (highest first)
    chunks.sort((a, b) => b.priority - a.priority);

    for (const chunk of chunks) {
        console.log(`   - ${chunk.name}: ${chunk.totalTokens.toLocaleString()} tokens, ${chunk.files.length} files`);
    }

    return chunks;
}

/**
 * Get chunk summary for coordinator planning
 */
export function getChunkSummary(chunks: Chunk[]): string {
    return chunks.map(c =>
        `[${c.id}] ${c.name}: ${c.files.length} files, ~${Math.round(c.totalTokens / 1000)}k tokens`
    ).join('\n');
}
