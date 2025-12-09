// @ts-nocheck
// Coordinator Agent - Phase 3 of Client-Side Orchestration
// Synthesizes results and SAVES the audit to the database.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runSynthesizer } from '../_shared/agents/synthesizer.ts';
import { AuditContext, WorkerResult } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../audit-runner/capabilities.ts'; // Re-use capabilities logic
import {
    validateRequestBody,
    createSupabaseClient,
    handleCorsPreflight,
    createErrorResponse,
    createSuccessResponse,
    validateSupabaseEnv,
    getOptionalUserId
} from '../_shared/utils.ts';

// Normalize LLM output for consistent frontend consumption
function normalizeStrengthsOrIssues(items: any[]): { title: string; detail: string }[] {
    if (!items || !Array.isArray(items)) return [];
    return items.map(item => {
        if (typeof item === 'string') {
            const colonIndex = item.indexOf(':');
            if (colonIndex > 0) {
                return {
                    title: item.substring(0, colonIndex).trim(),
                    detail: item.substring(colonIndex + 1).trim()
                };
            }
            return { title: item, detail: '' };
        }
        if (item && typeof item === 'object') {
            if (item.title) {
                return { title: item.title, detail: item.detail || item.description || '' };
            }
            if (item.area) {
                return { title: item.area, detail: item.description || '' };
            }
        }
        return { title: String(item), detail: '' };
    });
}

function normalizeRiskLevel(level: any): 'critical' | 'high' | 'medium' | 'low' | null {
    if (!level) return null;
    const normalized = String(level).toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
        return normalized as 'critical' | 'high' | 'medium' | 'low';
    }
    return null;
}

// Cost estimation formulas (same as audit-runner)
interface ComplexityFingerprint {
    file_count: number;
    total_bytes: number;
    token_estimate: number;
    frontend_files: number;
    backend_files: number;
    test_files: number;
    config_files: number;
    sql_files: number;
    has_supabase: boolean;
    api_endpoints_estimated: number;
}

const COST_FORMULAS: Record<string, { baseTokens: number; estimate: (fp: ComplexityFingerprint) => number }> = {
    'shape': {
        baseTokens: 5000,
        estimate: (fp) => 5000 + fp.file_count * 50 + fp.config_files * 200
    },
    'conventions': {
        baseTokens: 20000,
        estimate: (fp) => 20000 + fp.token_estimate * 0.05 + fp.test_files * 500
    },
    'performance': {
        baseTokens: 30000,
        estimate: (fp) => 30000 + fp.frontend_files * 800 + fp.backend_files * 600
    },
    'security': {
        baseTokens: 50000,
        estimate: (fp) => 50000 + fp.sql_files * 3000 + (fp.has_supabase ? 10000 : 0) + fp.api_endpoints_estimated * 1000
    },
    'supabase_deep_dive': {
        baseTokens: 60000,
        estimate: (fp) => 60000 + fp.sql_files * 4000 + fp.backend_files * 1000 + fp.api_endpoints_estimated * 1500
    }
};

function calculateServerEstimate(tier: string, files: any[]): number {
    const fingerprint: ComplexityFingerprint = {
        file_count: files.length,
        total_bytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
        token_estimate: Math.round(files.reduce((sum, f) => sum + (f.size || 0), 0) / 4),
        frontend_files: files.filter(f => /\.(tsx?|jsx?|vue|svelte)$/.test(f.path)).length,
        backend_files: files.filter(f => /\.(ts|js)$/.test(f.path) && /(server|api|function|handler)/.test(f.path)).length,
        test_files: files.filter(f => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.path)).length,
        config_files: files.filter(f => /\.(json|ya?ml|toml|env)$/.test(f.path) || /config/.test(f.path)).length,
        sql_files: files.filter(f => /\.sql$/.test(f.path)).length,
        has_supabase: files.some(f => /supabase/.test(f.path)),
        api_endpoints_estimated: files.filter(f => /(api|route|endpoint|handler)/.test(f.path)).length
    };

    const formula = COST_FORMULAS[tier];
    if (!formula) return 50000;

    const estimated = formula.estimate(fingerprint);
    return Math.max(formula.baseTokens, Math.round(estimated));
}

const ENV = validateSupabaseEnv({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
});

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return handleCorsPreflight();
    }

    try {
        if (!GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const supabase = createSupabaseClient(ENV);
        const userId = await getOptionalUserId(req, supabase);

        const body = await validateRequestBody(req);
        const { preflightId, workerResults, tier, plannerUsage } = body;

        if (!preflightId || !workerResults || !Array.isArray(workerResults)) {
            return createErrorResponse('Missing required parameters: preflightId, workerResults', 400);
        }

        // 1. Fetch Preflight & Prompt
        const { data: preflightRecord } = await supabase
            .from('preflights')
            .select('*')
            .eq('id', preflightId)
            .single();

        if (!preflightRecord) return createErrorResponse('Invalid preflight ID', 400);

        const { data: promptData } = await supabase
            .from('system_prompts')
            .select('prompt')
            .eq('tier', tier)
            .eq('is_active', true)
            .maybeSingle();

        const tierPrompt = promptData?.prompt || tier;

        // 2. Build Context
        const fileMap = preflightRecord.repo_map || [];
        const detectedStack = detectCapabilities(fileMap);

        const context: AuditContext = {
            repoUrl: preflightRecord.repo_url,
            files: fileMap.map(f => ({ ...f, type: 'file', content: undefined, url: f.url })),
            tier,
            preflight: { // Minimal preflight for context
                repo_url: preflightRecord.repo_url
            },
            detectedStack,
            githubToken: null
        };

        // 3. Run Synthesizer
        console.log(`🎓 [audit-coordinator] Synthesizing ${workerResults.length} results...`);
        const { result: finalReport, usage: synthesizerUsage } = await runSynthesizer(context, workerResults, GEMINI_API_KEY, tierPrompt);

        // 4. Calculate Total Tokens
        // We sum up: Planner (passed from client) + Workers (sum of results) + Synthesizer (just now)
        const workerTokenUsage = workerResults.reduce((sum, r) => sum + (r.tokenUsage || 0), 0);
        const totalTokens = (plannerUsage?.totalTokens || 0) + workerTokenUsage + (synthesizerUsage?.totalTokens || 0);

        // 5. Save to DB
        const serverEstimatedTokens = calculateServerEstimate(tier, fileMap);

        // Normalize issues
        const rawIssues = (finalReport?.issues && finalReport.issues.length > 0) ? finalReport.issues : [];
        const dbIssues = rawIssues.map((issue: any, index: number) => ({
            id: issue.id || `issue-${index}`,
            title: issue.title,
            description: issue.description,
            category: issue.category || 'Security',
            severity: issue.severity || 'warning',
            filePath: issue.filePath || 'Repository-wide',
            lineNumber: issue.line || 0,
            badCode: issue.badCode || issue.snippet || '',
            fixedCode: issue.remediation || '',
            cwe: issue.cwe
        }));

        const normalizedTopStrengths = normalizeStrengthsOrIssues(finalReport?.topStrengths || []);
        const normalizedTopWeaknesses = normalizeStrengthsOrIssues(finalReport?.topWeaknesses || []);
        const normalizedRiskLevel = normalizeRiskLevel(finalReport?.riskLevel);

        console.log(`💾 [audit-coordinator] Saving audit to DB...`);
        const { data: insertedAudit, error: insertError } = await supabase.from('audits').insert({
            user_id: userId,
            repo_url: preflightRecord.repo_url,
            tier: tier,
            estimated_tokens: serverEstimatedTokens,
            health_score: finalReport?.healthScore || 0,
            summary: finalReport?.summary || "No summary generated.",
            issues: dbIssues,
            total_tokens: totalTokens,
            extra_data: {
                topStrengths: normalizedTopStrengths,
                topWeaknesses: normalizedTopWeaknesses,
                riskLevel: normalizedRiskLevel,
                productionReady: finalReport?.productionReady ?? null,
                categoryAssessments: finalReport?.categoryAssessments || null,
                seniorDeveloperAssessment: finalReport?.seniorDeveloperAssessment || null,
                suspiciousFiles: finalReport?.suspiciousFiles || null,
                overallVerdict: finalReport?.overallVerdict || null,
                // Store raw breakdown for debug
                tokenBreakdown: {
                    planner: plannerUsage?.totalTokens || 0,
                    workers: workerTokenUsage,
                    synthesizer: synthesizerUsage?.totalTokens || 0
                }
            }
        }).select().single();

        if (insertError) {
            console.error('Failed to save audit:', insertError);
            // Continue anyway to return result to user, but log error
        }

        // 6. Return Final Report
        return createSuccessResponse({
            healthScore: finalReport.healthScore,
            summary: finalReport.summary,
            issues: dbIssues,
            riskLevel: normalizedRiskLevel,
            productionReady: finalReport.productionReady,
            topStrengths: normalizedTopStrengths,
            topIssues: normalizedTopWeaknesses,
            suspiciousFiles: finalReport?.suspiciousFiles || null,
            categoryAssessments: finalReport?.categoryAssessments || null,
            seniorDeveloperAssessment: finalReport?.seniorDeveloperAssessment || null,
            overallVerdict: finalReport?.overallVerdict || null,
            auditId: insertedAudit?.id, // Return ID so frontend can link to it
            meta: {
                detectedStack,
                totalTokens
            }
        });

    } catch (error) {
        console.error('[audit-coordinator] Error:', error);
        return createErrorResponse(error, 500);
    }
});
