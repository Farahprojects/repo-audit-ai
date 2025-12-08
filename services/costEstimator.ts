import { ComplexityFingerprint } from '../types';
import { AuditTier } from '../components/TierBadges';

export interface TierCostFormula {
  tier: AuditTier;
  estimateTokens: (fingerprint: ComplexityFingerprint) => number;
  baseTokens: number;
  maxOverrun: number; // e.g., 1.15 = 15% max overrun guarantee
}

// Cost estimation formulas for each audit tier
// These formulas are tuned based on real usage data and can be adjusted
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
  }
];

export class CostEstimator {
  /**
   * Estimate the token cost for a specific audit tier based on repository complexity
   */
  static estimateTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
    const formula = COST_FORMULAS.find(f => f.tier === tier);
    if (!formula) {
      throw new Error(`No cost formula found for tier: ${tier}`);
    }

    const estimated = formula.estimateTokens(fingerprint);
    // Ensure minimum cost
    return Math.max(formula.baseTokens, Math.round(estimated));
  }

  /**
   * Get the maximum possible tokens for a tier (including overrun guarantee)
   */
  static getMaxTokens(tier: AuditTier, fingerprint: ComplexityFingerprint): number {
    const estimated = this.estimateTokens(tier, fingerprint);
    const formula = COST_FORMULAS.find(f => f.tier === tier)!;
    return Math.round(estimated * formula.maxOverrun);
  }

  /**
   * Format tokens for display (e.g., "15.2k" or "1.2M")
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  /**
   * Calculate cost in dollars based on estimated tokens
   * Note: This assumes a token-to-dollar conversion rate
   */
  static tokensToDollars(tokens: number, dollarsPerThousandTokens: number = 0.01): number {
    return Math.round((tokens / 1000) * dollarsPerThousandTokens * 100) / 100;
  }

  /**
   * Get all tier estimates for a given fingerprint
   */
  static getAllTierEstimates(fingerprint: ComplexityFingerprint): Record<AuditTier, number> {
    const estimates: Partial<Record<AuditTier, number>> = {};
    COST_FORMULAS.forEach(formula => {
      estimates[formula.tier] = this.estimateTokens(formula.tier, fingerprint);
    });
    return estimates as Record<AuditTier, number>;
  }

  /**
   * Validate that actual tokens don't exceed the guaranteed maximum
   */
  static validateActualCost(tier: AuditTier, fingerprint: ComplexityFingerprint, actualTokens: number): boolean {
    const maxAllowed = this.getMaxTokens(tier, fingerprint);
    return actualTokens <= maxAllowed;
  }
}
