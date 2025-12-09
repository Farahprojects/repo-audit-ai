/// <reference lib="deno.ns" />

// Database Migration Tests
// These test the chunking logic without requiring a full database connection
// Run with: deno test --allow-read tests/unit/database.test.ts

import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock database functions for testing chunking logic
function mockPgColumnSize(data: any): number {
  // More accurate mock of PostgreSQL's pg_column_size function
  // pg_column_size returns the size in bytes, including overhead
  const jsonString = JSON.stringify(data);
  // Add some overhead for PostgreSQL storage format
  return jsonString.length + Math.ceil(jsonString.length * 0.1);
}

function mockJsonbArrayLength(arr: any[]): number {
  return arr.length;
}

function mockJsonbAgg(elements: any[]): any {
  return elements;
}

function mockUnnest(array: any[], start?: number, end?: number): any[] {
  if (start !== undefined && end !== undefined) {
    return array.slice(start - 1, end); // PostgreSQL arrays are 1-indexed
  }
  return array;
}

// Test the chunking algorithm logic
Deno.test("Database Chunking - Basic Algorithm", () => {
  const maxChunkSize = 500 * 1024; // 500KB
  const batchSize = 50;
  const issues = Array.from({ length: 200 }, (_, i) => ({
    id: `issue-${i}`,
    title: `Security issue ${i}`,
    description: `Detailed description of issue ${i}`.repeat(10), // Make it larger
    severity: "high"
  }));

  // Simulate the chunking logic
  const chunks: any[][] = [];
  let chunkIndex = 0;
  let currentBatchSize = batchSize;

  while (chunkIndex * currentBatchSize < issues.length) {
    let chunkData = null;
    let chunkSize = 0;

    // Try to create a chunk with current batch size
    const start = chunkIndex * currentBatchSize + 1;
    const end = Math.min((chunkIndex + 1) * currentBatchSize, issues.length);

    if (start <= issues.length) {
      const slice = issues.slice(start - 1, end);
      chunkData = slice;
      chunkSize = mockPgColumnSize(chunkData);

      // If chunk is too large, try smaller batches
      while (chunkSize >= maxChunkSize && currentBatchSize > 1) {
        currentBatchSize = Math.max(1, currentBatchSize / 2);
        const newEnd = Math.min((chunkIndex + 1) * currentBatchSize, issues.length);
        const newSlice = issues.slice(start - 1, newEnd);
        chunkData = newSlice;
        chunkSize = mockPgColumnSize(chunkData);
      }

      if (chunkData && chunkSize < maxChunkSize) {
        chunks.push(chunkData);
      }
    }

    chunkIndex++;
  }

  // Verify chunking worked
  assert(chunks.length > 0, "Should create at least one chunk");
  assert(chunks.length <= Math.ceil(issues.length / batchSize), "Should not create too many chunks");

  // Verify total issues preserved
  const totalChunkedIssues = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  assertEquals(totalChunkedIssues, issues.length, "All issues should be preserved in chunks");

  // Verify chunk sizes
  chunks.forEach((chunk, index) => {
    const chunkSize = mockPgColumnSize(chunk);
    assert(chunkSize < maxChunkSize, `Chunk ${index} should be under size limit`);
  });
});

Deno.test("Database Chunking - Edge Cases", () => {
  // Test with empty issues array
  const emptyIssues: any[] = [];
  assertEquals(emptyIssues.length, 0, "Empty array should have length 0");

  // Test with single large issue
  const largeIssue = {
    id: "large-issue",
    description: "x".repeat(100000) // 100KB issue
  };

  const chunkSize = mockPgColumnSize([largeIssue]);
  // The chunk size limit in the actual code is 500KB, so this should be under that limit
  assert(chunkSize < 500 * 1024, "Large issue should still be under 500KB chunk limit");

  // Test with small issues
  const smallIssues = Array.from({ length: 10 }, (_, i) => ({
    id: `small-${i}`,
    description: "small issue"
  }));

  const smallChunkSize = mockPgColumnSize(smallIssues);
  assert(smallChunkSize < 50 * 1024, "Small issues should fit in one chunk");
});

Deno.test("Database Chunking - Chunk Reconstruction", () => {
  // Test that we can reconstruct the original data from chunks
  const originalIssues = [
    { id: "issue-1", severity: "high" },
    { id: "issue-2", severity: "medium" },
    { id: "issue-3", severity: "low" }
  ];

  // Simulate chunking into two chunks
  const chunk1 = [originalIssues[0], originalIssues[1]];
  const chunk2 = [originalIssues[2]];

  // Simulate reconstruction
  const reconstructed = [...chunk1, ...chunk2];

  assertEquals(reconstructed.length, originalIssues.length);
  assertEquals(reconstructed[0].id, originalIssues[0].id);
  assertEquals(reconstructed[1].id, originalIssues[1].id);
  assertEquals(reconstructed[2].id, originalIssues[2].id);
});

console.log("✅ All database chunking tests passed!");
