// @ts-ignore - Deno types are available at runtime in Supabase Edge Functions
// Shared cost estimation utilities - centralized logic for token estimation
// This prevents logic drift between cost-estimator, audit-runner, and audit-coordinator

import { estimateTokensFromBytes } from './utils.ts';

// Canonical tier mapping - single source of truth
export const TIER_MAPPING: Record<string, string> = {
  'lite': 'shape',
  'deep': 'conventions',
  'ultra': 'security',
  'performance': 'performance',
  'security': 'security',
  'shape': 'shape',
  'conventions': 'conventions',
  'supabase_deep_dive': 'supabase_deep_dive',
};

export const VALID_TIERS = ['shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'] as const;
export type AuditTier = typeof VALID_TIERS[number];

// Complexity fingerprint interface - single source of truth
export interface ComplexityFingerprint {
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

export interface TierCostFormula {
  tier: AuditTier;
  estimateTokens: (fingerprint: ComplexityFingerprint) => number;
  baseTokens: number;
  maxOverrun: number;
}

// Cost estimation formulas - centralized single source of truth
export const COST_FORMULAS: TierCostFormula[] = [
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

// Legacy interface for backward compatibility with audit-runner/audit-coordinator
export interface LegacyCostFormula {
  baseTokens: number;
  estimate: (fp: ComplexityFingerprint) => number;
}

// Convert new format to legacy format for backward compatibility
export const LEGACY_COST_FORMULAS: Record<string, LegacyCostFormula> = COST_FORMULAS.reduce((acc, formula) => {
  acc[formula.tier] = {
    baseTokens: formula.baseTokens,
    estimate: formula.estimateTokens
  };
  return acc;
}, {} as Record<string, LegacyCostFormula>);

// Core estimation functions
export function estimateTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
  const formula = COST_FORMULAS.find(f => f.tier === tier);
  if (!formula) {
    throw new Error(`No cost formula found for tier: ${tier}`);
  }
  const estimated = formula.estimateTokens(fingerprint);
  return Math.max(formula.baseTokens, Math.round(estimated));
}

export function getMaxTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
  const estimated = estimateTokens(tier, fingerprint);
  const formula = COST_FORMULAS.find(f => f.tier === tier)!;
  return Math.round(estimated * formula.maxOverrun);
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

export function mapTier(frontendTier: string): AuditTier | null {
  const mapped = TIER_MAPPING[frontendTier];
  if (mapped && VALID_TIERS.includes(mapped as AuditTier)) {
    return mapped as AuditTier;
  }
  return null;
}

// Build complexity fingerprint from file list
export function buildComplexityFingerprint(files: any[]): ComplexityFingerprint {
  return {
    file_count: files.length,
    total_bytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
    token_estimate: files.reduce((sum, f) => sum + estimateTokensFromBytes(f.size || 0), 0),
    language_primary: '', // Not used in current formulas
    language_mix: [], // Not used in current formulas
    frontend_files: files.filter(f => /\.(tsx?|jsx?|vue|svelte)$/.test(f.path)).length,
    backend_files: files.filter(f => /\.(ts|js)$/.test(f.path) && /(server|api|function|handler)/.test(f.path)).length,
    test_files: files.filter(f => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.path)).length,
    config_files: files.filter(f => /\.(json|ya?ml|toml|env)$/.test(f.path) || /config/.test(f.path)).length,
    sql_files: files.filter(f => /\.sql$/.test(f.path)).length,
    has_supabase: files.some(f => /supabase/.test(f.path)),
    has_prisma: files.some(f => /prisma/.test(f.path)),
    has_drizzle: files.some(f => /drizzle/.test(f.path)),
    api_endpoints_estimated: files.filter(f => /(api|route|endpoint|handler)/.test(f.path)).length
  };
}

// Legacy function for backward compatibility with audit-runner/audit-coordinator
export function calculateServerEstimate(tier: string, files: any[]): number {
  const fingerprint = buildComplexityFingerprint(files);
  const formula = LEGACY_COST_FORMULAS[tier];
  if (!formula) return 50000; // Default fallback

  const estimated = formula.estimate(fingerprint);
  return Math.max(formula.baseTokens, Math.round(estimated));
}

// Estimate all tiers at once
export function estimateAllTiers(fingerprint: ComplexityFingerprint): Record<string, { estimatedTokens: number; maxTokens: number; formatted: string }> {
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

  return estimates;
}
