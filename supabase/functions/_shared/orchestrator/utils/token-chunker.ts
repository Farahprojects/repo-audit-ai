/**
 * Token Chunker
 * 
 * Splits work into token-safe chunks to avoid hitting LLM context limits.
 */

// Rough token estimation: ~4 characters per token
const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
    maxTokens: number;
    overlapTokens?: number;  // Overlap between chunks for context continuity
}

export class TokenChunker {
    /**
     * Estimate tokens in a string
     */
    estimateTokens(text: string): number {
        return Math.ceil(text.length / CHARS_PER_TOKEN);
    }

    /**
     * Estimate tokens in an object (JSON serialized)
     */
    estimateObjectTokens(obj: unknown): number {
        return this.estimateTokens(JSON.stringify(obj));
    }

    /**
     * Chunk an array of items to fit within token limits
     */
    chunk<T>(items: T[], maxTokens: number, serializer?: (item: T) => string): T[][] {
        const chunks: T[][] = [];
        let currentChunk: T[] = [];
        let currentTokens = 0;

        for (const item of items) {
            const itemText = serializer ? serializer(item) : JSON.stringify(item);
            const itemTokens = this.estimateTokens(itemText);

            // If single item exceeds limit, it gets its own chunk (or needs truncation)
            if (itemTokens > maxTokens) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentTokens = 0;
                }
                chunks.push([item]);
                continue;
            }

            // If adding this item would exceed limit, start new chunk
            if (currentTokens + itemTokens > maxTokens) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                currentChunk = [item];
                currentTokens = itemTokens;
            } else {
                currentChunk.push(item);
                currentTokens += itemTokens;
            }
        }

        // Don't forget the last chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Chunk text content with overlap for continuity
     */
    chunkText(text: string, options: ChunkOptions): string[] {
        const { maxTokens, overlapTokens = 100 } = options;
        const maxChars = maxTokens * CHARS_PER_TOKEN;
        const overlapChars = overlapTokens * CHARS_PER_TOKEN;

        if (text.length <= maxChars) {
            return [text];
        }

        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + maxChars;

            // Try to break at a natural boundary (newline, sentence, word)
            if (end < text.length) {
                const searchStart = Math.max(start + maxChars - 500, start);
                const searchText = text.slice(searchStart, end);

                // Try to find a paragraph break
                const paragraphBreak = searchText.lastIndexOf('\n\n');
                if (paragraphBreak !== -1) {
                    end = searchStart + paragraphBreak + 2;
                } else {
                    // Try a sentence break
                    const sentenceBreak = searchText.lastIndexOf('. ');
                    if (sentenceBreak !== -1) {
                        end = searchStart + sentenceBreak + 2;
                    } else {
                        // Try a word break
                        const wordBreak = searchText.lastIndexOf(' ');
                        if (wordBreak !== -1) {
                            end = searchStart + wordBreak + 1;
                        }
                    }
                }
            }

            chunks.push(text.slice(start, end));

            // Start next chunk with overlap
            start = end - overlapChars;
        }

        return chunks;
    }

    /**
     * Chunk file list for audit processing
     */
    chunkFiles(
        files: Array<{ path: string; size?: number; content?: string }>,
        maxTokensPerChunk: number
    ): Array<typeof files> {
        return this.chunk(files, maxTokensPerChunk, file => {
            // Estimate based on path and content
            const pathTokens = this.estimateTokens(file.path);
            const contentTokens = file.content ? this.estimateTokens(file.content) : 0;
            // Return a representative string for token estimation
            return file.path + (file.content || '');
        });
    }

    /**
     * Smart chunking that groups related files together
     */
    chunkByDirectory(
        files: Array<{ path: string; content?: string }>,
        maxTokensPerChunk: number
    ): Array<typeof files> {
        // Group files by directory
        const dirGroups = new Map<string, typeof files>();

        for (const file of files) {
            const parts = file.path.split('/');
            const dir = parts.slice(0, -1).join('/') || '.';

            const group = dirGroups.get(dir) || [];
            group.push(file);
            dirGroups.set(dir, group);
        }

        // Now chunk, trying to keep directory groups together
        const chunks: typeof files[] = [];
        let currentChunk: typeof files = [];
        let currentTokens = 0;

        for (const [dir, dirFiles] of dirGroups) {
            const dirTokens = dirFiles.reduce((sum, f) =>
                sum + this.estimateTokens(f.path) + this.estimateTokens(f.content || ''), 0
            );

            // If entire directory fits, add to current chunk
            if (currentTokens + dirTokens <= maxTokensPerChunk) {
                currentChunk.push(...dirFiles);
                currentTokens += dirTokens;
            } else {
                // Start new chunk
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }

                // If dir is too large, split it
                if (dirTokens > maxTokensPerChunk) {
                    const subChunks = this.chunk(dirFiles, maxTokensPerChunk);
                    chunks.push(...subChunks.slice(0, -1));
                    currentChunk = subChunks[subChunks.length - 1];
                    currentTokens = this.estimateTokens(JSON.stringify(currentChunk));
                } else {
                    currentChunk = dirFiles;
                    currentTokens = dirTokens;
                }
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }
}

// Singleton instance
let chunkerInstance: TokenChunker | null = null;

export function getTokenChunker(): TokenChunker {
    if (!chunkerInstance) {
        chunkerInstance = new TokenChunker();
    }
    return chunkerInstance;
}
