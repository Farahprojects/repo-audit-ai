/**
 * Audit Dispatcher - Central Orchestration Layer
 *
 * This is the single entry point for all audit requests from the UI.
 * It intelligently routes requests between the old system and new orchestrator
 * based on feature flags, user preferences, and system health.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from '@supabase/supabase-js';
import { RequestValidationService } from '../_shared/services/RequestValidationService.ts';
import { LoggerService, RequestTracer } from '../_shared/services/LoggerService.ts';
import { ErrorTrackingService } from '../_shared/services/ErrorTrackingService.ts';
import { RuntimeMonitoringService, withPerformanceMonitoring } from '../_shared/services/RuntimeMonitoringService.ts';

interface AuditRequest {
  preflightId: string;
  tier: string;
  userId: string;
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
  fallbackAllowed: boolean;
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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
      options,
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
      decision: routingDecision,
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
    userId: string;
    options: any;
  }
): Promise<RoutingDecision> {

  const { preflightId, tier, userId, options } = params;

  // 1. Check explicit overrides
  if (options.forceLegacy) {
    return {
      useNewSystem: false,
      reason: 'Explicitly forced to use legacy system',
      confidence: 1.0,
      fallbackAllowed: false
    };
  }

  if (options.forceOrchestrator) {
    return {
      useNewSystem: true,
      reason: 'Explicitly forced to use new orchestrator',
      confidence: 1.0,
      fallbackAllowed: true
    };
  }

  // 2. Check feature flags (can be stored in database or env vars)
  const featureFlags = await getFeatureFlags(supabase);

  if (!featureFlags.orchestratorEnabled) {
    return {
      useNewSystem: false,
      reason: 'Orchestrator system disabled by feature flag',
      confidence: 1.0,
      fallbackAllowed: false
    };
  }

  // 3. Check user preferences (future: allow users to opt-in/out)
  const userPreferences = await getUserPreferences(supabase, userId);

  if (userPreferences.forceLegacy) {
    return {
      useNewSystem: false,
      reason: 'User preference: legacy system only',
      confidence: 1.0,
      fallbackAllowed: false
    };
  }

  // 4. A/B Testing logic (canary deployment)
  const abTestDecision = await evaluateABTest(supabase, userId);

  if (abTestDecision.group === 'orchestrator') {
    return {
      useNewSystem: true,
      reason: `A/B test: user in orchestrator group (${abTestDecision.confidence * 100}% confidence)`,
      confidence: abTestDecision.confidence,
      fallbackAllowed: true
    };
  }

  // 5. Gradual rollout by tier
  const tierRollout = getTierRolloutConfig(tier);

  if (tierRollout.enabled && Math.random() < tierRollout.percentage) {
    return {
      useNewSystem: true,
      reason: `Gradual rollout: ${tier} tier (${tierRollout.percentage * 100}% rollout)`,
      confidence: 0.8,
      fallbackAllowed: true
    };
  }

  // 6. Health checks (if orchestrator is having issues, fallback)
  const systemHealth = await checkSystemHealth(supabase);

  if (!systemHealth.orchestratorHealthy) {
    return {
      useNewSystem: false,
      reason: 'Orchestrator system unhealthy, using legacy fallback',
      confidence: 0.9,
      fallbackAllowed: false
    };
  }

  // 7. Default: use legacy system (conservative approach)
  return {
    useNewSystem: false,
    reason: 'Default routing: using proven legacy system',
    confidence: 0.5,
    fallbackAllowed: true
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
    userId: string;
    options: any;
    routingDecision: RoutingDecision;
    correlationId: string;
  }
) {
  const { preflightId, tier, userId, options, correlationId } = params;

  try {
    LoggerService.info('Invoking orchestrator', {
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

    if (error) throw error;

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

  } catch (error) {
    LoggerService.error('Orchestrator routing failed', error as Error, {
      component: 'AuditDispatcher',
      preflightId,
      correlationId
    });

    // If fallback is allowed and orchestrator fails, try legacy
    if (params.routingDecision.fallbackAllowed) {
      LoggerService.info('Attempting fallback to legacy system', {
        component: 'AuditDispatcher',
        preflightId,
        correlationId
      });

      return await routeToLegacyOrchestrator(supabase, {
        ...params,
        routingDecision: {
          ...params.routingDecision,
          reason: `Fallback: ${params.routingDecision.reason} (orchestrator failed)`
        }
      });
    }

    // No fallback allowed, return error
    throw error;
  }
}

async function routeToLegacyOrchestrator(
  supabase: any,
  params: {
    preflightId: string;
    tier: string;
    userId: string;
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

  // Call the existing audit-orchestrator
  const { data, error } = await supabase.functions.invoke('audit-orchestrator', {
    body: { preflightId, tier, userId }
  });

  if (error) throw error;

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
}

// ============================================================================
// DECISION HELPERS
// ============================================================================

async function getFeatureFlags(supabase: any) {
  // TODO: Implement feature flag storage (database/env/config)
  return {
    orchestratorEnabled: true, // Start with orchestrator enabled
    allowFallback: true,
    enableABTesting: false
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
