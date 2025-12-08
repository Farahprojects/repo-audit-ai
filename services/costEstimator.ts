// Cost Estimator Client - Thin wrapper that calls the edge function
// All pricing logic is now server-side for security
import { supabase } from '../src/integrations/supabase/client';
import { ComplexityFingerprint } from '../types';

export type AuditTier = 'shape' | 'conventions' | 'performance' | 'security' | 'supabase_deep_dive';

interface TierEstimate {
  estimatedTokens: number;
  maxTokens: number;
  formatted: string;
}

interface AllTierEstimates {
  estimates: Record<AuditTier, TierEstimate>;
}

export class CostEstimator {
  /**
   * Get estimated tokens for a specific tier (calls edge function)
   */
  static async estimateTokensAsync(tier: string, fingerprint: ComplexityFingerprint): Promise<TierEstimate> {
    const { data, error } = await supabase.functions.invoke('cost-estimator', {
      body: { action: 'estimate', tier, fingerprint }
    });

    if (error) {
      throw new Error(`Cost estimation failed: ${error.message}`);
    }

    return {
      estimatedTokens: data.estimatedTokens,
      maxTokens: data.maxTokens,
      formatted: data.formatted,
    };
  }

  /**
   * Get estimates for all tiers at once (calls edge function)
   */
  static async getAllTierEstimatesAsync(fingerprint: ComplexityFingerprint): Promise<Record<AuditTier, TierEstimate>> {
    const { data, error } = await supabase.functions.invoke('cost-estimator', {
      body: { action: 'estimateAll', fingerprint }
    });

    if (error) {
      throw new Error(`Cost estimation failed: ${error.message}`);
    }

    return data.estimates;
  }

  /**
   * Map frontend tier to backend tier (calls edge function)
   */
  static async mapTierAsync(frontendTier: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('cost-estimator', {
      body: { action: 'mapTier', tier: frontendTier }
    });

    if (error) {
      throw new Error(`Tier mapping failed: ${error.message}`);
    }

    return data.backendTier;
  }

  /**
   * Format tokens for display (local helper - no security risk)
   */
  static formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }
}
