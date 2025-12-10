// Audit Runner - Orchestration layer for 5-Pass "Magic Analysis" Pipeline
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import Services
import { RequestValidator, ValidatedAuditRequest } from './RequestValidator.ts';
import { PreflightService } from './PreflightService.ts';
import { TokenService } from './TokenService.ts';
import { ResultsAggregator, AggregatedReport } from './ResultsAggregator.ts';
import { ScoringService } from './ScoringService.ts';
import { AuditRepository, AuditData } from './AuditRepository.ts';
import { AuditOrchestrator } from './AuditOrchestrator.ts';

// Import Agents and Types
import { AuditContext } from '../_shared/agents/types.ts';
import { detectCapabilities } from '../_shared/capabilities.ts';
import {
  validateSupabaseEnv,
  createSupabaseClient,
  getOptionalUserId,
  handleCorsPreflight,
  createErrorResponse,
  createSuccessResponse
} from '../_shared/utils.ts';




// Environment configuration
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

    // Optional auth - audits can run without authentication for public repos
    const userId = await getOptionalUserId(req, supabase);

    // 1. REQUEST VALIDATION
    const validatedRequest: ValidatedAuditRequest = await RequestValidator.validateRequest(req);

    // 2. PREFLIGHT DATA FETCHING
    const preflightService = new PreflightService(supabase);
    const preflightRecord = validatedRequest.preflightId
      ? await preflightService.fetchPreflight(validatedRequest.preflightId)
      : validatedRequest.preflightRecord;

    // Extract files from preflight if not provided directly
    const finalFileMap = PreflightService.extractFilesFromPreflight(preflightRecord) || validatedRequest.fileMap;

    // 3. TOKEN MANAGEMENT & PRICING
    const effectiveGitHubToken = await TokenService.getEffectiveToken(preflightRecord, validatedRequest.githubToken);

    // Calculate estimated tokens for pricing (used for both Quote and Run)
    const { ExecutionPricing } = await import('../_shared/services/ExecutionPricing.ts');
    const { estimateTokens } = await import('../_shared/costEstimation.ts');

    let estimatedTokens = validatedRequest.serverEstimatedTokens;
    if (!estimatedTokens && preflightRecord) {
      estimatedTokens = estimateTokens(validatedRequest.tier as any, preflightRecord.fingerprint);
    }
    const finalEstimate = estimatedTokens || 10000; // Fallback
    const quote = ExecutionPricing.calculatePrice(finalEstimate);

    // -- TRANSACTIONAL PRICING CHECK --
    if (validatedRequest.action === 'quote') {
      return createSuccessResponse({
        success: true,
        quote
      });
    }

    // -- PAYMENT ENFORCEMENT --
    // If we are running (not quoting), we must have a payment method
    // TODO: We might allow free tier for small public repos later, but for now enforcing strict transactional
    // const passedBody = await req.json(); // Re-parsing potentially (careful with stream consumption - RequestValidator cloned it?)
    // Actually RequestValidator reads body. We need to check validatedRequest or parse again if needed. 
    // Ideally RequestValidator should pass all fields.
    // Let's assume validation passed `paymentMethodId` if we added it to ValidatedAuditRequest, 
    // OR we access it from the original request if we didn't consume it fully? 
    // RequestValidator.validateRequest uses req.json(), so the stream is consumed. 
    // We MUST update RequestValidator to extract paymentMethodId.

    // STOP: I need to update RequestValidator first to extract paymentMethodId.
    // I will do that in the next step. For now, I will write the LOGIC assuming it's in validatedRequest.

    /* 
       Wait, I cannot use 'passedBody' here because stream is consumed.
       I must rely on validatedRequest having it. 
       I will mark this step to update RequestValidator Next.
    */

    if (!validatedRequest.paymentMethodId) {
      return createErrorResponse(new Error("Payment required for audit execution. Please provide paymentMethodId."), 402);
    }

    const { PaymentService } = await import('../_shared/services/PaymentService.ts');
    const paymentResult = await PaymentService.capturePayment(quote.totalCents, 'usd', validatedRequest.paymentMethodId);

    if (!paymentResult.success) {
      return createErrorResponse(new Error(`Payment declined: ${paymentResult.error}`), 402);
    }

    // 4. SYSTEM PROMPT FETCHING
    const auditRepository = new AuditRepository(supabase);
    const tierPrompt = await auditRepository.fetchTierPrompt(validatedRequest.tier);

    // 5. CONTEXT BUILDING
    const detectedStack = detectCapabilities(finalFileMap);

    // Build context conditionally to handle exactOptionalPropertyTypes
    const baseContext = {
      repoUrl: validatedRequest.repoUrl,
      files: finalFileMap.map(f => ({
        path: f.path,
        type: 'file',
        size: f.size,
        url: f.url
        // content omitted - agents must fetch it
      })),
      tier: validatedRequest.tier,
      ...(preflightRecord && {
        preflight: {
          id: preflightRecord.id,
          repo_url: preflightRecord.repo_url,
          owner: preflightRecord.owner,
          repo: preflightRecord.repo,
          default_branch: preflightRecord.default_branch,
          repo_map: preflightRecord.repo_map,
          stats: preflightRecord.stats,
          fingerprint: preflightRecord.fingerprint,
          is_private: preflightRecord.is_private,
          fetch_strategy: preflightRecord.fetch_strategy,
          token_valid: preflightRecord.token_valid,
          file_count: preflightRecord.file_count
        }
      }),
      detectedStack
    } as AuditContext;

    const context: AuditContext = effectiveGitHubToken ?
      { ...baseContext, githubToken: effectiveGitHubToken } :
      baseContext;

    // 6. SWARM PIPELINE EXECUTION
    const orchestrator = new AuditOrchestrator(GEMINI_API_KEY);
    const orchestrationResult = await orchestrator.executeSwarmPipeline(context, tierPrompt);

    // 7. RESULTS AGGREGATION
    const aggregatedReport: AggregatedReport = ResultsAggregator.aggregateWorkerResults(orchestrationResult.swarmResults);

    // 8. SCORING AND SUMMARY GENERATION
    const { healthScore, summary } = ScoringService.calculateHealthScoreAndSummary(aggregatedReport.issues, aggregatedReport.appMap);

    // Update the aggregated report with final scores
    aggregatedReport.healthScore = healthScore;
    aggregatedReport.summary = summary;

    // SERVER-SIDE TOKEN VALIDATION
    // Check for discrepancies between client and server estimates
    if (validatedRequest.estimatedTokens &&
      Math.abs(validatedRequest.estimatedTokens - validatedRequest.serverEstimatedTokens) > validatedRequest.serverEstimatedTokens * 0.5) {
      console.warn(`⚠️ Large discrepancy between client (${validatedRequest.estimatedTokens}) and server (${validatedRequest.serverEstimatedTokens}) estimates`);
    }

    // 9. DATABASE PERSISTENCE
    const auditData: AuditData = {
      userId,
      repoUrl: validatedRequest.repoUrl,
      tier: validatedRequest.tier,
      estimatedTokens: validatedRequest.serverEstimatedTokens,
      healthScore: aggregatedReport.healthScore,
      summary: aggregatedReport.summary,
      issues: aggregatedReport.issues,
      totalTokens: orchestrationResult.totalTokens,
      topStrengths: aggregatedReport.topStrengths,
      topWeaknesses: aggregatedReport.topWeaknesses,
      riskLevel: aggregatedReport.riskLevel,
      productionReady: aggregatedReport.productionReady,
      categoryAssessments: aggregatedReport.categoryAssessments,
      seniorDeveloperAssessment: aggregatedReport.seniorDeveloperAssessment,
      suspiciousFiles: aggregatedReport.suspiciousFiles || [],
      overallVerdict: aggregatedReport.overallVerdict,
    };

    await auditRepository.saveAudit(auditData);

    // 10. RESPONSE PREPARATION
    const normalizedResponse = auditRepository.getNormalizedAuditResponse(auditData);

    return createSuccessResponse({
      ...normalizedResponse,
      meta: {
        planValues: orchestrationResult.plan,
        swarmCount: orchestrationResult.swarmResults.length,
        duration: orchestrationResult.durationMs,
        detectedStack,
        tokenEstimates: {
          client: validatedRequest.estimatedTokens || null,
          server: validatedRequest.serverEstimatedTokens,
          actual: orchestrationResult.totalTokens
        }
      }
    });

  } catch (error) {
    console.error('Pipeline Error:', error);
    return createErrorResponse(error, 500);
  }
});
