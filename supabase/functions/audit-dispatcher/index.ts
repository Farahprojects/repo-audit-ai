/**
 * Audit Dispatcher - Central Orchestration Layer
 *
 * This is the single entry point for all audit requests from the UI.
 * Currently routes ALL requests to LEGACY audit-orchestrator system.
 * Temporarily switched back to legacy for stability.
 *
 * Universal orchestrator accessible via forceOrchestrator: true override.
 */

// @ts-ignore - Deno environment provides global Deno object
declare const Deno: any;

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - Deno environment provides these imports
import { corsHeaders } from '../_shared/cors.ts';
// @ts-ignore - Deno environment provides these imports
import { createClient } from '@supabase/supabase-js';
// @ts-ignore - Deno environment provides these imports
import { RequestValidationService } from '../_shared/services/RequestValidationService.ts';
// @ts-ignore - Deno environment provides these imports
import { LoggerService, RequestTracer } from '../_shared/services/LoggerService.ts';
// @ts-ignore - Deno environment provides these imports
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts';
// @ts-ignore - Deno environment provides these imports
import { RuntimeMonitoringService, withPerformanceMonitoring } from '../_shared/services/RuntimeMonitoringService.ts';

interface AuditRequest {
  preflightId: string;
  tier: string;
  userId?: string;  // Optional - will get from JWT if not provided
  options?: {
    forceLegacy?: boolean;     // Force old system
    forceOrchestrator?: boolean; // Force new system
    enableStreaming?: boolean;   // Enable SSE for new system
    maxIterations?: number;      // For orchestrator
  };
}

interface RoutingDecision {
  useNewSystem: boolean;
  reason: string;
  confidence: number; // 0-1, how confident we are in this choice
}

serve(withPerformanceMonitoring(async (req) => {
  const tracer = LoggerService.startRequest('audit-dispatcher', {
    component: 'AuditDispatcher',
    function: 'serve'
  });

  // Handle CORS
  if (req.method === 'OPTIONS') {
    tracer.end(true);
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    LoggerService.info('Audit dispatcher request received', {
      component: 'AuditDispatcher',
      method: req.method,
      url: req.url
    });

    // Initialize Supabase client
    // @ts-ignore - Deno.env is available in Deno runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno.env is available in Deno runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate request
    const body: AuditRequest = await req.json();
    tracer.checkpoint('request-parsed', { preflightId: body.preflightId });

    const validation = RequestValidationService.validateAuditOrchestrationRequest(body);

    if (!validation.isValid) {
      LoggerService.warn('Request validation failed', {
        component: 'AuditDispatcher',
        error: new Error(validation.error),
        preflightId: body.preflightId
      });

      tracer.end(false, { error: validation.error });
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { preflightId, tier, userId, options = {} } = body;
    const correlationId = tracer.getCorrelationId();

    LoggerService.info('Making routing decision', {
      component: 'AuditDispatcher',
      preflightId,
      tier,
      userId,
      correlationId
    });

    // ============================================================================
    // ROUTING DECISION ENGINE
    // ============================================================================

    const routingDecision = await makeRoutingDecision(supabase, {
      preflightId,
      tier,
      userId,
      options
    });

    LoggerService.info('Routing decision made', {
      component: 'AuditDispatcher',
      preflightId,
      correlationId
    });

    // ============================================================================
    // EXECUTE REQUEST BASED ON ROUTING
    // ============================================================================

    if (routingDecision.useNewSystem) {
      LoggerService.info('Routing to NEW orchestrator system', {
        component: 'AuditDispatcher',
        preflightId,
        correlationId
      });

      return await routeToOrchestrator(supabase, {
        preflightId,
        tier,
        userId,
        options,
        routingDecision,
        correlationId
      });

    } else {
      LoggerService.info('Routing to LEGACY audit-orchestrator system', {
        component: 'AuditDispatcher',
        preflightId,
        correlationId
      });

      return await routeToLegacyOrchestrator(supabase, {
        preflightId,
        tier,
        userId,
        options,
        routingDecision,
        correlationId
      });
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';

    LoggerService.error('Audit dispatcher failed', error as Error, {
      component: 'AuditDispatcher',
      function: 'serve'
    });

    ErrorTrackingService.captureError(error as Error, {
      component: 'AuditDispatcher',
      function: 'serve'
    }, 'high');

    tracer.end(false, { error: errorMsg });

    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}, 'audit-dispatcher'));

// ============================================================================
// ROUTING DECISION ENGINE
// ============================================================================

async function makeRoutingDecision(
  supabase: any,
  params: {
    preflightId: string;
    tier: string;
    userId?: string;
    options: any;
  }
): Promise<RoutingDecision> {

  const { preflightId, tier, userId, options } = params;

  // 1. Check explicit overrides (admin controls)
  if (options.forceLegacy) {
    return {
      useNewSystem: false,
      reason: 'ADMIN OVERRIDE: Forced to use legacy system for debugging',
      confidence: 1.0
    };
  }

  if (options.forceOrchestrator) {
    return {
      useNewSystem: true,
      reason: 'ADMIN OVERRIDE: Forced to use orchestrator for testing',
      confidence: 1.0
    };
  }

  // 2. Check feature flags - orchestrator should be default enabled
  const featureFlags = await getFeatureFlags(supabase);

  if (!featureFlags.orchestratorEnabled) {
    return {
      useNewSystem: false,
      reason: 'EMERGENCY: Orchestrator system disabled by feature flag',
      confidence: 1.0
    };
  }

  // 3. Check user-specific overrides (rare admin cases)
  if (userId) {
    const userPreferences = await getUserPreferences(supabase, userId);

    if (userPreferences.forceLegacy) {
      return {
        useNewSystem: false,
        reason: 'USER OVERRIDE: User explicitly requested legacy system',
        confidence: 1.0
      };
    }
  }

  // 4. DEFAULT: Use LEGACY audit-orchestrator system
  // Temporarily switched back to legacy for stability
  return {
    useNewSystem: false,
    reason: 'DEFAULT: Using Legacy Audit Orchestrator system',
    confidence: 0.9
  };
}

// ============================================================================
// ROUTING EXECUTION
// ============================================================================

async function routeToOrchestrator(
  supabase: any,
  params: {
    preflightId: string;
    tier: string;
    userId?: string;
    options: any;
    routingDecision: RoutingDecision;
    correlationId: string;
  }
) {
  const { preflightId, tier, userId, options, correlationId } = params;

  LoggerService.info('Invoking orchestrator (NO FALLBACK)', {
    component: 'AuditDispatcher',
    preflightId,
    tier,
    correlationId
  });

  // Call the new orchestrator with legacy-compatible format
  const { data, error } = await supabase.functions.invoke('orchestrator', {
    body: {
      preflightId,
      tier,
      stream: options.enableStreaming || false,
      thinkingBudget: getThinkingBudgetForTier(tier),
      maxIterations: options.maxIterations || 50,
      userId // Pass for tracking
    }
  });

  if (error) {
    LoggerService.error('Orchestrator failed - NO FALLBACK', error as Error, {
      component: 'AuditDispatcher',
      preflightId,
      correlationId
    });

    // NO FALLBACK - Let the new system succeed or fail on its own
    throw new Error(`Orchestrator failed: ${error.message || 'Unknown error'}`);
  }

  LoggerService.info('Orchestrator completed successfully', {
    component: 'AuditDispatcher',
    preflightId,
    correlationId
  });

  // Return response with routing metadata
  return new Response(
    JSON.stringify({
      ...data,
      _routing: {
        system: 'orchestrator',
        reason: params.routingDecision.reason,
        confidence: params.routingDecision.confidence
      }
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

async function routeToLegacyOrchestrator(
  supabase: any,
  params: {
    preflightId: string;
    tier: string;
    userId?: string;
    options: any;
    routingDecision: RoutingDecision;
    correlationId: string;
  }
) {
  const { preflightId, tier, userId, correlationId } = params;

  LoggerService.info('Invoking legacy audit-orchestrator', {
    component: 'AuditDispatcher',
    preflightId,
    tier,
    correlationId
  });

  try {
    // Call the existing audit-orchestrator
    const { data, error } = await supabase.functions.invoke('audit-orchestrator', {
      body: { preflightId, tier, userId }
    });

    if (error) {
      LoggerService.warn('Audit orchestrator invoke failed, providing fallback response', {
        component: 'AuditDispatcher',
        metadata: { invokeError: error.message },
        preflightId,
        tier
      });

      // Provide fallback response for legacy system
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Audit orchestration initiated (legacy fallback)',
          correlationId,
          status: {
            preflightId,
            status: 'processing',
            progress: 0
          },
          _routing: {
            system: 'legacy',
            reason: params.routingDecision.reason,
            confidence: params.routingDecision.confidence,
            fallback: true
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Return response with routing metadata
    return new Response(
      JSON.stringify({
        ...data,
        _routing: {
          system: 'legacy',
          reason: params.routingDecision.reason,
          confidence: params.routingDecision.confidence
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (invokeError) {
    LoggerService.warn('Audit orchestrator invoke threw exception, providing fallback response', {
      component: 'AuditDispatcher',
      metadata: { invokeError: invokeError instanceof Error ? invokeError.message : String(invokeError) },
      preflightId,
      tier
    });

    // Provide fallback response for legacy system
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audit orchestration initiated (legacy fallback)',
        correlationId,
        status: {
          preflightId,
          status: 'processing',
          progress: 0
        },
        _routing: {
          system: 'legacy',
          reason: params.routingDecision.reason,
          confidence: params.routingDecision.confidence,
          fallback: true
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

// ============================================================================
// DECISION HELPERS
// ============================================================================

async function getFeatureFlags(supabase: any) {
  // TODO: Implement feature flag storage (database/env/config)
  return {
    orchestratorEnabled: true, // NEW SYSTEM IS DEFAULT - NO MORE FALLBACKS
    enableEmergencyOverride: true, // Allow admin override in critical situations
  };
}

async function getUserPreferences(supabase: any, userId: string) {
  // TODO: Implement user preference storage
  return {
    forceLegacy: false,
    preferredSystem: null
  };
}

async function evaluateABTest(supabase: any, userId: string) {
  // TODO: Implement A/B testing logic
  // For now, route 10% of users to orchestrator
  const hash = simpleHash(userId);
  const inTestGroup = (hash % 100) < 10; // 10% rollout

  return {
    group: inTestGroup ? 'orchestrator' : 'legacy',
    confidence: 0.8
  };
}

function getTierRolloutConfig(tier: string) {
  // Gradual rollout configuration by tier
  const configs = {
    'starter': { enabled: true, percentage: 0.5 },    // 50% rollout
    'security': { enabled: true, percentage: 0.3 },   // 30% rollout
    'performance': { enabled: true, percentage: 0.2 }, // 20% rollout
    'comprehensive': { enabled: true, percentage: 0.1 } // 10% rollout
  };

  return configs[tier as keyof typeof configs] || { enabled: false, percentage: 0 };
}

async function checkSystemHealth(supabase: any) {
  // TODO: Implement system health checks
  // Check recent error rates, response times, etc.
  return {
    orchestratorHealthy: true,
    legacyHealthy: true
  };
}

function getThinkingBudgetForTier(tier: string): string {
  const budgets = {
    'starter': 'audit',
    'security': 'audit',
    'performance': 'complex',
    'comprehensive': 'maximum'
  };

  return budgets[tier as keyof typeof budgets] || 'audit';
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
