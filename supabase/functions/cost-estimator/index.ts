// @ts-nocheck
// Cost Estimator Edge Function - Server-side token estimation
// Keeps pricing logic secure and tamper-proof

import { handleCorsPreflight, createErrorResponse, createSuccessResponse } from '../_shared/utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Canonical tier mapping - single source of truth
const TIER_MAPPING: Record<string, string> = {
  'lite': 'shape',
  'deep': 'conventions',
  'ultra': 'security',
  'performance': 'performance',
  'security': 'security',
  'shape': 'shape',
  'conventions': 'conventions',
  'supabase_deep_dive': 'supabase_deep_dive',
};

// Valid backend tiers
const VALID_TIERS = ['shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'] as const;
type AuditTier = typeof VALID_TIERS[number];

// Complexity fingerprint interface
interface ComplexityFingerprint {
  file_count: number;
  total_bytes: number;
  token_estimate: number;
  language_primary: string;
  language_mix: string[];
  frontend_files: number;
  backend_files: number;
  test_files: number;
  config_files: number;
  sql_files: number;
  has_supabase: boolean;
  has_prisma: boolean;
  has_drizzle: boolean;
  api_endpoints_estimated: number;
}

interface TierCostFormula {
  tier: AuditTier;
  estimateTokens: (fingerprint: ComplexityFingerprint) => number;
  baseTokens: number;
  maxOverrun: number;
}

// Cost estimation formulas - server-side only
const COST_FORMULAS: TierCostFormula[] = [
  {
    tier: 'shape',
    baseTokens: 5000,
    maxOverrun: 1.1,
    estimateTokens: (fp) => 5000 + fp.file_count * 50 + fp.config_files * 200
  },
  {
    tier: 'conventions',
    baseTokens: 20000,
    maxOverrun: 1.15,
    estimateTokens: (fp) => 20000 + fp.token_estimate * 0.05 + fp.test_files * 500
  },
  {
    tier: 'performance',
    baseTokens: 30000,
    maxOverrun: 1.15,
    estimateTokens: (fp) => 30000 + fp.frontend_files * 800 + fp.backend_files * 600
  },
  {
    tier: 'security',
    baseTokens: 50000,
    maxOverrun: 1.2,
    estimateTokens: (fp) => 50000 + fp.sql_files * 3000 + (fp.has_supabase ? 10000 : 0) + fp.api_endpoints_estimated * 1000
  },
  {
    tier: 'supabase_deep_dive',
    baseTokens: 60000,
    maxOverrun: 1.2,
    estimateTokens: (fp) => 60000 + fp.sql_files * 4000 + fp.backend_files * 1000 + fp.api_endpoints_estimated * 1500
  }
];

function estimateTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
  const formula = COST_FORMULAS.find(f => f.tier === tier);
  if (!formula) {
    throw new Error(`No cost formula found for tier: ${tier}`);
  }
  const estimated = formula.estimateTokens(fingerprint);
  return Math.max(formula.baseTokens, Math.round(estimated));
}

function getMaxTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
  const estimated = estimateTokens(tier, fingerprint);
  const formula = COST_FORMULAS.find(f => f.tier === tier)!;
  return Math.round(estimated * formula.maxOverrun);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

function mapTier(frontendTier: string): AuditTier | null {
  const mapped = TIER_MAPPING[frontendTier];
  if (mapped && VALID_TIERS.includes(mapped as AuditTier)) {
    return mapped as AuditTier;
  }
  return null;
}

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

      const estimates: Record<string, { estimatedTokens: number; maxTokens: number; formatted: string }> = {};

      for (const tier of VALID_TIERS) {
        const estimated = estimateTokens(tier, fingerprint);
        const max = getMaxTokens(tier, fingerprint);
        estimates[tier] = {
          estimatedTokens: estimated,
          maxTokens: max,
          formatted: formatTokens(estimated),
        };
      }

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
