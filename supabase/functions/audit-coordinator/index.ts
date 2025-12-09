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

        // 🧠 EGO-BASED SCORING ALGORITHM
        // Calculate health score using weighted severity and project size normalization

        // Step 1: Weighted Severity Score
        const severityWeights = { critical: 5, warning: 2, info: 1 };
        let rawScore = 0;

        allIssues.forEach((issue: any) => {
          const severity = (issue.severity || 'info').toLowerCase();
          const weight = severityWeights[severity as keyof typeof severityWeights] || 1;
          rawScore += weight;
        });

        // Step 2: Normalize Based on Project Size
        // Use file_count from combined app maps (or fallback to preflight)
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
        const normalized = rawScore / Math.log(fileCount + 8); // Log normalization

        // Step 3: Convert to 0-100 Final Score
        const healthScore = Math.max(0, Math.min(100, Math.round(100 - normalized)));

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

        // 🎯 EGO-DRIVEN SUMMARY SYSTEM
        // Generate psychologically effective summaries based on ego archetypes

        const crucialCount = minimizedIssues.filter((i: any) => i.severity?.toLowerCase() === 'critical').length;
        const warningCount = minimizedIssues.filter((i: any) => i.severity?.toLowerCase() === 'warning').length;

        let summary: string;
        let egoArchetype: string;

        // Determine ego archetype based on issue severity distribution
        if (crucialCount <= 1 && warningCount < 5) {
          // 🏆 SENIOR ENGINEER ENERGY
          egoArchetype = "senior";
          summary = `This repo carries the signature of someone who knows what they're doing. The structure is coherent, conventions are respected, and most of the issues found reflect fine-tuning rather than fundamental gaps.

This feels like work from a strong mid-to-senior engineer who understands patterns, separation of concerns, and long-term maintainability.

The improvements here won't reshape the project — they'll elevate it.`;
        } else if (crucialCount <= 3) {
          // 💪 SOLID FOUNDATION NEEDS PUSH
          egoArchetype = "solid";
          summary = `There's a clear foundation here — the architecture shows intent, and the patterns indicate someone who understands modern development practices.

But the app is sitting right on the edge of breaking into a higher tier. With a few structural cleanups and more consistency across modules, this could easily shine like a polished product built by a confident engineer.`;
        } else if (crucialCount <= 7) {
          // 🧠 SMART BUT NEEDS DISCIPLINE
          egoArchetype = "smart";
          summary = `This codebase has moments of real talent — you can see the problem-solving ability and raw capability in the stronger sections.

The gaps don't come from incompetence; they come from lack of consistency or rushed delivery. With more structure, this repo could reflect the level of skill that's clearly present in the stronger sections.`;
        } else {
          // 🔄 RESPECTFUL REBUILD NEEDED
          egoArchetype = "rebuild";
          summary = `There's a lot of passion in this project, but it feels like something built without the constraints or patterns of a production environment.

The ideas are strong — the execution just needs a reset and a more deliberate structure. With a rebuild guided by clear best practices, this could transform from a chaotic prototype into something that genuinely reflects your capability.`;
        }

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
