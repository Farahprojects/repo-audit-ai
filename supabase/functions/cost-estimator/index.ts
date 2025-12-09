// Cost Estimator Edge Function - Server-side token estimation
// Keeps pricing logic secure and tamper-proof

import { handleCorsPreflight, createErrorResponse, createSuccessResponse } from '../_shared/utils.ts';
import {
  estimateTokens,
  getMaxTokens,
  formatTokens,
  mapTier,
  estimateAllTiers,
  type ComplexityFingerprint
} from '../_shared/costEstimation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  try {
    const { action, fingerprint, tier, tiers } = await req.json();

    // Action: estimate - get estimate for a single tier
    if (action === 'estimate') {
      if (!fingerprint || !tier) {
        return createErrorResponse('Missing fingerprint or tier', 400);
      }

      const backendTier = mapTier(tier);
      if (!backendTier) {
        return createErrorResponse(`Invalid tier: ${tier}`, 400);
      }

      const estimated = estimateTokens(backendTier, fingerprint);
      const max = getMaxTokens(backendTier, fingerprint);

      console.log(`[cost-estimator] Tier: ${tier} -> ${backendTier}, Estimated: ${estimated}, Max: ${max}`);

      return createSuccessResponse({
        tier: backendTier,
        estimatedTokens: estimated,
        maxTokens: max,
        formatted: formatTokens(estimated),
      });
    }

    // Action: estimateAll - get estimates for all tiers
    if (action === 'estimateAll') {
      if (!fingerprint) {
        return createErrorResponse('Missing fingerprint', 400);
      }

      const estimates = estimateAllTiers(fingerprint);

      console.log(`[cost-estimator] All tier estimates calculated for fingerprint with ${fingerprint.file_count} files`);

      return createSuccessResponse({ estimates });
    }

    // Action: mapTier - validate and map a frontend tier to backend tier
    if (action === 'mapTier') {
      if (!tier) {
        return createErrorResponse('Missing tier', 400);
      }

      const backendTier = mapTier(tier);
      if (!backendTier) {
        return createErrorResponse(`Invalid tier: ${tier}`, 400);
      }

      return createSuccessResponse({ frontendTier: tier, backendTier });
    }

    return createErrorResponse('Invalid action. Use: estimate, estimateAll, or mapTier', 400);

  } catch (error) {
    console.error('[cost-estimator] Error:', error);
    return createErrorResponse(error, 500);
  }
});
