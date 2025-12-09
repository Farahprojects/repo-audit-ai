// @ts-nocheck
// Coordinator Agent - Phase 3 of Client-Side Orchestration
// Synthesizes results and SAVES the audit to the database.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { AuditContext, WorkerResult } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../_shared/capabilities.ts';
import {
    validateRequestBody,
    createSupabaseClient,
    handleCorsPreflight,
    createErrorResponse,
    createSuccessResponse,
    validateSupabaseEnv,
    getOptionalUserId
} from '../_shared/utils.ts';
import { calculateServerEstimate } from '../_shared/costEstimation.ts';
import { normalizeStrengthsOrIssues, normalizeRiskLevel } from '../_shared/normalization.ts';
import { calculateHealthScore, generateEgoDrivenSummary } from '../_shared/scoringUtils.ts';



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

        // 3. Deterministic Aggregation (No LLM)

        // Flatten all issues
        const allIssues = workerResults.flatMap(r => r.findings.issues || []);

        // Deduplicate issues by title + filename
        const uniqueIssuesMap = new Map<string, any>();
        allIssues.forEach((issue: any) => {
            const key = `${issue.title}-${issue.filePath}`;
            if (!uniqueIssuesMap.has(key)) {
                uniqueIssuesMap.set(key, issue);
            }
        });
        const minimizedIssues = Array.from(uniqueIssuesMap.values());

        // 🧠 EGO-BASED SCORING ALGORITHM (now shared)
        const combinedAppMap = workerResults.reduce((map: any, result) => {
          const workerMap = result.findings.appMap || {};
          return {
            file_count: Math.max(map.file_count || 0, workerMap.file_count || fileMap.length),
            languages: [...new Set([...(map.languages || []), ...(workerMap.languages || [])])],
            frameworks: [...new Set([...(map.frameworks || []), ...(workerMap.frameworks || [])])],
            complexity: workerMap.complexity || map.complexity || 'medium'
          };
        }, {});

        const fileCount = combinedAppMap.file_count || fileMap.length;
        const healthScore = calculateHealthScore({ issues: allIssues, fileCount });

        // Determine Risk Level
        let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
        if (healthScore < 50) riskLevel = 'critical';
        else if (healthScore < 70) riskLevel = 'high';
        else if (healthScore < 85) riskLevel = 'medium';

        // Aggregate Strengths/Weaknesses (if workers provided them)
        const allStrengths = workerResults.flatMap(r => r.findings.strengths || []);
        const allWeaknesses = workerResults.flatMap(r => r.findings.weaknesses || []);

        // Simple frequency count for top items could be added here, 
        // but for now just taking unique strings or first few conventions found
        const topStrengths = [...new Set(allStrengths)].slice(0, 5);
        const topWeaknesses = [...new Set(allWeaknesses)].slice(0, 5);

        // 🎯 EGO-DRIVEN SUMMARY SYSTEM (now shared)
        const summary = generateEgoDrivenSummary(minimizedIssues);

        // 4. Calculate Total Tokens
        const workerTokenUsage = workerResults.reduce((sum, r) => sum + (r.tokenUsage || 0), 0);
        const totalTokens = (plannerUsage?.totalTokens || 0) + workerTokenUsage;

        // 5. Save to DB
        const serverEstimatedTokens = calculateServerEstimate(tier, fileMap);

        // Normalize issues
        const dbIssues = minimizedIssues.map((issue: any, index: number) => ({
            id: issue.id || `issue-${index}`,
            title: issue.title,
            description: issue.description,
            category: issue.category || 'General',
            severity: issue.severity || 'warning',
            filePath: issue.filePath || 'Repository-wide',
            lineNumber: issue.line || 0,
            badCode: issue.badCode || issue.snippet || '',
            fixedCode: issue.remediation || '',
            cwe: issue.cwe
        }));

        const normalizedTopStrengths = normalizeStrengthsOrIssues(topStrengths);
        const normalizedTopWeaknesses = normalizeStrengthsOrIssues(topWeaknesses);
        const normalizedRiskLevel = normalizeRiskLevel(riskLevel);

        const { data: insertedAudit, error: insertError } = await supabase.from('audits').insert({
            user_id: userId,
            repo_url: preflightRecord.repo_url,
            tier: tier,
            estimated_tokens: serverEstimatedTokens,
            health_score: healthScore,
            summary: summary,
            issues: dbIssues,
            total_tokens: totalTokens,
            extra_data: {
                topStrengths: normalizedTopStrengths,
                topWeaknesses: normalizedTopWeaknesses,
                riskLevel: normalizedRiskLevel,
                productionReady: healthScore > 80,
                categoryAssessments: null, // Removed synthesizer assessment
                seniorDeveloperAssessment: null,
                suspiciousFiles: null,
                overallVerdict: null,
                tokenBreakdown: {
                    planner: plannerUsage?.totalTokens || 0,
                    workers: workerTokenUsage,
                    synthesizer: 0
                }
            }
        }).select().single();

        if (insertError) {
            console.error('Failed to save audit:', insertError);
        }

        // 6. Return Final Report
        return createSuccessResponse({
            healthScore: healthScore,
            summary: summary,
            issues: dbIssues,
            riskLevel: normalizedRiskLevel,
            productionReady: healthScore > 80,
            topStrengths: normalizedTopStrengths,
            topIssues: normalizedTopWeaknesses,
            suspiciousFiles: null,
            categoryAssessments: null,
            seniorDeveloperAssessment: null,
            overallVerdict: null,
            auditId: insertedAudit?.id,
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
