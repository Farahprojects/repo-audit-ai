/**
 * Audit Tools for Universal Orchestrator
 * 
 * These tools wrap the existing audit capabilities for use in the orchestrator.
 * This allows the audit flow to be one of many potential workflows.
 */

import {
    Tool,
    ToolResult,
    ToolContext,
    PermissionLevel
} from '../core/types.ts';

// ============================================================================
// Analyze Code Files Tool
// ============================================================================

export const analyzeCodeFilesTool: Tool = {
    name: 'analyze_code_files',
    description: 'Analyzes code files for issues, patterns, and quality. Pass file contents and get back structured findings.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            files: {
                type: 'array',
                description: 'Array of {path, content} objects to analyze'
            },
            focusAreas: {
                type: 'array',
                description: 'Areas to focus on: security, performance, quality, patterns',
                required: false
            },
            context: {
                type: 'string',
                description: 'Additional context about the codebase',
                required: false
            }
        },
        required: ['files']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { files, focusAreas = ['quality'], context: analysisContext } = input as {
            files: Array<{ path: string; content: string }>;
            focusAreas?: string[];
            context?: string;
        };

        if (!files || files.length === 0) {
            return {
                success: false,
                error: 'No files provided for analysis'
            };
        }

        if (!context.apiKey) {
            return {
                success: false,
                error: 'Gemini API key not available'
            };
        }

        try {
            // Prepare the analysis prompt
            const fileContents = files.map(f =>
                `--- ${f.path} ---\n${f.content || 'File content not available'}`
            ).join('\n\n');

            const focusAreaText = focusAreas.join(', ');
            const systemPrompt = `You are an expert code auditor. Analyze the provided code files for the following focus areas: ${focusAreaText}.

Return your analysis in this exact JSON format:
{
  "issues": [
    {
      "id": "unique_id",
      "severity": "critical|high|warning|info",
      "category": "Security|Performance|Quality|Maintenance|Architecture",
      "title": "Brief, clear title",
      "description": "Detailed explanation of the issue",
      "filePath": "filename.ext",
      "line": 42,
      "badCode": "problematic code snippet (optional)",
      "remediation": "suggested fix (optional)"
    }
  ],
  "strengths": ["key strength 1", "key strength 2"],
  "weaknesses": ["key weakness 1", "key weakness 2"],
  "appMap": {
    "languages": ["js", "ts"],
    "frameworks": ["react", "node"],
    "patterns": ["modular", "functional"],
    "complexity": "low|medium|high"
  }
}`;

            const userPrompt = `Please analyze these ${files.length} files for ${focusAreaText} issues:

${fileContents}

${analysisContext ? `\nAdditional Context: ${analysisContext}` : ''}

Focus on identifying real issues and providing actionable insights.`;

            // Call Gemini API
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro/generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': context.apiKey
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 8192,
                            thinkingConfig: {
                                thinkingBudget: 4096
                            }
                        }
                    })
                }
            );

            if (!response.ok) {
                return {
                    success: false,
                    error: `Gemini API error: ${response.status}`,
                    metadata: { statusCode: response.status }
                };
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                return {
                    success: false,
                    error: 'No response from Gemini API'
                };
            }

            // Extract JSON from response (Gemini might add markdown formatting)
            let jsonText = text;
            if (text.includes('```json')) {
                const match = text.match(/```json\s*([\s\S]*?)\s*```/);
                if (match) jsonText = match[1];
            }

            try {
                const analysis = JSON.parse(jsonText);

                return {
                    success: true,
                    data: {
                        issues: analysis.issues || [],
                        strengths: analysis.strengths || [],
                        weaknesses: analysis.weaknesses || [],
                        appMap: analysis.appMap || {},
                        filesAnalyzed: files.length,
                        focusAreas
                    },
                    tokenUsage: result.usageMetadata?.totalTokenCount || 0
                };
            } catch (parseError) {
                // If JSON parsing fails, return the raw text for debugging
                return {
                    success: false,
                    error: 'Failed to parse Gemini response as JSON',
                    data: { rawResponse: text },
                    metadata: { parseError: parseError instanceof Error ? parseError.message : String(parseError) }
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Calculate Health Score Tool
// ============================================================================

export const calculateHealthScoreTool: Tool = {
    name: 'calculate_health_score',
    description: 'Calculates an overall health score based on issues found in the codebase.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            issues: {
                type: 'array',
                description: 'Array of issue objects with severity field'
            },
            fileCount: {
                type: 'number',
                description: 'Total number of files in the repository'
            }
        },
        required: ['issues', 'fileCount']
    },

    async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
        const { issues, fileCount } = input as {
            issues: Array<{ severity: string }>;
            fileCount: number;
        };

        // Scoring algorithm (from existing scoringUtils.ts)
        let deductions = 0;

        for (const issue of issues) {
            switch (issue.severity) {
                case 'critical':
                    deductions += 15;
                    break;
                case 'warning':
                case 'high':
                    deductions += 5;
                    break;
                case 'medium':
                    deductions += 2;
                    break;
                case 'info':
                case 'low':
                    deductions += 0.5;
                    break;
            }
        }

        // Normalize by file count (larger projects can have more issues)
        const normalizedDeduction = Math.min(deductions, 100);
        const healthScore = Math.max(0, 100 - normalizedDeduction);

        // Determine risk level
        let riskLevel: string;
        if (healthScore < 50) riskLevel = 'critical';
        else if (healthScore < 70) riskLevel = 'high';
        else if (healthScore < 85) riskLevel = 'medium';
        else riskLevel = 'low';

        return {
            success: true,
            data: {
                healthScore: Math.round(healthScore),
                riskLevel,
                issueBreakdown: {
                    critical: issues.filter(i => i.severity === 'critical').length,
                    warning: issues.filter(i => i.severity === 'warning' || i.severity === 'high').length,
                    info: issues.filter(i => i.severity === 'info' || i.severity === 'low').length
                },
                productionReady: healthScore > 80
            }
        };
    }
};

// ============================================================================
// Generate Summary Tool
// ============================================================================

export const generateSummaryTool: Tool = {
    name: 'generate_summary',
    description: 'Generates an executive summary based on audit findings.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            healthScore: { type: 'number', description: 'Health score (0-100)' },
            issues: { type: 'array', description: 'Array of issues found' },
            strengths: { type: 'array', description: 'Array of strengths identified' },
            repoName: { type: 'string', description: 'Repository name' }
        },
        required: ['healthScore', 'issues']
    },

    async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
        const { healthScore, issues, strengths = [], repoName = 'this repository' } = input as {
            healthScore: number;
            issues: any[];
            strengths?: string[];
            repoName?: string;
        };

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning' || i.severity === 'high').length;

        let verdict: string;
        if (healthScore >= 90) {
            verdict = `${repoName} demonstrates excellent code quality with minimal issues.`;
        } else if (healthScore >= 75) {
            verdict = `${repoName} is in good shape with some areas for improvement.`;
        } else if (healthScore >= 50) {
            verdict = `${repoName} needs attention. Several issues were identified that should be addressed.`;
        } else {
            verdict = `${repoName} requires significant work. Critical issues were found that need immediate attention.`;
        }

        const summary = [
            verdict,
            criticalCount > 0 ? `Found ${criticalCount} critical issue(s).` : '',
            warningCount > 0 ? `Found ${warningCount} warning(s).` : '',
            strengths.length > 0 ? `Key strengths: ${strengths.slice(0, 2).join(', ')}.` : ''
        ].filter(Boolean).join(' ');

        return {
            success: true,
            data: { summary }
        };
    }
};

// ============================================================================
// Deep AI Analysis Tool
// ============================================================================

export const deepAIAnalysisTool: Tool = {
    name: 'deep_ai_analysis',
    description: 'Performs deep AI-powered analysis on code, architecture, or specific issues. Use this for complex analysis that requires LLM reasoning.',
    requiredPermission: PermissionLevel.READ,

    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The analysis question or request'
            },
            context: {
                type: 'object',
                description: 'Additional context data (files, repo info, etc.)',
                required: false
            },
            analysisType: {
                type: 'string',
                description: 'Type of analysis: architecture, security, performance, quality',
                enum: ['architecture', 'security', 'performance', 'quality', 'general'],
                required: false
            }
        },
        required: ['query']
    },

    async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
        const { query, context: analysisContext, analysisType = 'general' } = input as {
            query: string;
            context?: any;
            analysisType?: string;
        };

        if (!context.apiKey) {
            return {
                success: false,
                error: 'Gemini API key not available'
            };
        }

        try {
            const systemPrompt = `You are an expert software engineering consultant specializing in ${analysisType} analysis. Provide deep, insightful analysis based on the query and context provided.

Focus on:
- Technical accuracy
- Actionable insights
- Best practices
- Potential issues and solutions

Provide your analysis in a structured format.`;

            const userPrompt = `Query: ${query}

${analysisContext ? `Context: ${JSON.stringify(analysisContext, null, 2)}` : ''}`;

            // Call Gemini API
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro/generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': context.apiKey
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 8192,
                            thinkingConfig: {
                                thinkingBudget: 6144
                            }
                        }
                    })
                }
            );

            if (!response.ok) {
                return {
                    success: false,
                    error: `Gemini API error: ${response.status}`,
                    metadata: { statusCode: response.status }
                };
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                return {
                    success: false,
                    error: 'No response from Gemini API'
                };
            }

            return {
                success: true,
                data: {
                    analysis: text,
                    analysisType,
                    query
                },
                tokenUsage: result.usageMetadata?.totalTokenCount || 0
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};

// ============================================================================
// Export all audit tools
// ============================================================================

export const auditTools: Tool[] = [
    analyzeCodeFilesTool,
    calculateHealthScoreTool,
    generateSummaryTool,
    deepAIAnalysisTool
];
