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

        // This is a placeholder - in production, you'd call the worker logic
        // For now, return a structured response that the orchestrator can use
        const issues: any[] = [];
        const strengths: string[] = [];
        const weaknesses: string[] = [];

        // Simple heuristic analysis for demonstration
        for (const file of files) {
            const content = file.content || '';

            // Check for common issues
            if (content.includes('console.log') && focusAreas.includes('quality')) {
                issues.push({
                    id: `console-${file.path}`,
                    severity: 'info',
                    category: 'Code Quality',
                    title: 'Console.log statement found',
                    description: 'Debug logging should be removed in production code',
                    filePath: file.path
                });
            }

            if (content.includes('TODO') || content.includes('FIXME')) {
                issues.push({
                    id: `todo-${file.path}`,
                    severity: 'info',
                    category: 'Maintenance',
                    title: 'TODO comment found',
                    description: 'Outstanding work items in codebase',
                    filePath: file.path
                });
            }

            if (focusAreas.includes('security')) {
                if (content.includes('eval(')) {
                    issues.push({
                        id: `eval-${file.path}`,
                        severity: 'critical',
                        category: 'Security',
                        title: 'Use of eval() detected',
                        description: 'eval() is a security risk - consider alternatives',
                        filePath: file.path
                    });
                }
            }
        }

        // Identify strengths based on patterns
        const hasTypeScript = files.some(f => f.path.endsWith('.ts') || f.path.endsWith('.tsx'));
        if (hasTypeScript) {
            strengths.push('TypeScript usage for type safety');
        }

        const hasTests = files.some(f => f.path.includes('test') || f.path.includes('spec'));
        if (hasTests) {
            strengths.push('Test files present');
        }

        return {
            success: true,
            data: {
                issues,
                strengths,
                weaknesses,
                filesAnalyzed: files.length,
                focusAreas
            },
            tokenUsage: 0 // Heuristic analysis uses no tokens
        };
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
// Export all audit tools
// ============================================================================

export const auditTools: Tool[] = [
    analyzeCodeFilesTool,
    calculateHealthScoreTool,
    generateSummaryTool
];
