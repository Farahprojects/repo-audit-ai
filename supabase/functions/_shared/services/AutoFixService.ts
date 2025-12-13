import { callGemini, GEMINI_MODEL } from "../agents/utils.ts";
import { ExecutionPricing, PriceQuote } from "./ExecutionPricing.ts";
import { estimateTokensFromBytes } from "../utils.ts";

export interface FixSpec {
    filePath: string;
    originalContent: string;
    fixedContent: string;
    description: string;
    confidence: number;
}

export interface Issue {
    id: string;
    filePath: string;
    lineNumber?: number;
    message: string;
    snippet?: string;
}

export class AutoFixService {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Generates a fix for a specific issue in a file.
     */
    async generateFix(issue: Issue, fileContent: string): Promise<FixSpec> {
        const systemPrompt = `You are an expert software engineer tasked with fixing code issues.
    You will be given a file content and a specific issue to fix.
    Your goal is to provide the corrected version of the file.
    
    You must output JSON in the following format:
    {
      "fixedContent": "full content of the file with the fix applied",
      "description": "brief explanation of what was fixed",
      "confidence": 0.0 to 1.0 score of how confident you are in this fix
    }
    
    RULES:
    1. Return the FULL file content, not just the diff.
    2. Do not change anything unrelated to the issue.
    3. Maintain existing coding style (indentation, quotes, etc).
    4. If the issue is unclear or cannot be fixed safely, return confidence < 0.5.
    `;

        const userPrompt = `
    FILE PATH: ${issue.filePath}
    ISSUE description: ${issue.message}
    LINE NUMBER: ${issue.lineNumber || 'Unknown'}
    
    FILE CONTENT:
    \`\`\`
    ${fileContent}
    \`\`\`
    
    Please provide the fix.
    `;

        const response = await callGemini(
            this.apiKey,
            systemPrompt,
            userPrompt,
            0.1, // Low temperature for deterministic fixes
            { role: 'WORKER' } // Use Worker budget
        );

        const result = response.data;

        if (!result.fixedContent || typeof result.confidence !== 'number') {
            throw new Error("Invalid response from AI model");
        }

        return {
            filePath: issue.filePath,
            originalContent: fileContent,
            fixedContent: result.fixedContent,
            description: result.description || "Auto-fix applied",
            confidence: result.confidence
        };
    }

    /**
     * Generates a price quote for fixing an issue.
     * Uses existing cost estimation logic logic based on file size.
     */
    async getQuote(issue: Issue, fileContent: string): Promise<PriceQuote> {
        // Create a minimal complexity fingerprint for single file fix
        // This estimates the token load for the specific fix operation
        const fileSize = fileContent.length;

        // Rough estimate: file tokens (input) + instruction tokens + expected output (full file again)
        // Input: File bytes / 4
        // Instructions: ~500 tokens
        // Output: File bytes / 4
        const estimatedTokens = (estimateTokensFromBytes(fileSize) * 2) + 500;

        return ExecutionPricing.calculatePrice(estimatedTokens);
    }
}
