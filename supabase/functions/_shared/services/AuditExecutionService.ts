// Audit Execution Service - Handles planner/worker orchestration
// Follows Single Responsibility Principle: Only executes the audit pipeline

import { runPlanner } from '../agents/planner.ts';
import { runWorker } from '../agents/worker.ts';
import { AuditContext, WorkerResult } from '../agents/types.ts';
import { detectCapabilities } from '../capabilities.ts';

export interface AuditExecutionResult {
  workerResults: WorkerResult[];
  totalTokens: number;
  detectedStack: any;
  duration: number;
  plan: any;
}

export class AuditExecutionService {
  /**
   * Execute the complete audit pipeline (planner + workers)
   */
  async executeAudit(
    repoUrl: string,
    fileMap: any[],
    tier: string,
    githubToken: string | null,
    preflightRecord: any,
    geminiApiKey: string,
    tierPrompt: string
  ): Promise<AuditExecutionResult> {
    // Build audit context
    const context = this.buildAuditContext(repoUrl, fileMap, tier, githubToken, preflightRecord);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${'='.repeat(60)}\n`);

    // Phase 1: MAP PHASE - The Planner (CEO)
    const { result: plan, usage: plannerUsage } = await runPlanner(context, geminiApiKey, tierPrompt);
    plan.tasks.forEach((t, i) => console.log(`📋 Task ${i + 1}: ${t.instruction}`));

    // Phase 2: WORKER PHASE - The Swarm (Parallel Execution)
    const timeStart = Date.now();
    console.log(`\n🚀 Launching ${plan.tasks.length} parallel workers...`);

    const workerPromises = plan.tasks.map(async (task) => {
      return runWorker(context, task, geminiApiKey);
    });

    // Use Promise.allSettled for robust error handling
    const workerOutputs = await Promise.allSettled(workerPromises);

    // Aggregate Results & Token Usage
    const { workerResults, swarmTokenUsage, failedWorkers } = this.aggregateWorkerOutputs(workerOutputs);

    if (failedWorkers > 0) {
      console.warn(`⚠️ ${failedWorkers}/${workerOutputs.length} workers failed. Continuing with ${workerResults.length} results.`);
    }

    const timeEnd = Date.now();
    const durationMs = timeEnd - timeStart;

    // Phase 3: AGGREGATE PHASE - Direct aggregation from worker results
    const totalTokens = (plannerUsage?.totalTokens || 0) + swarmTokenUsage;

    console.log(`📊 Pipeline complete: ${workerResults.length} results, ${totalTokens} tokens, ${durationMs}ms`);

    return {
      workerResults,
      totalTokens,
      detectedStack: context.detectedStack,
      duration: durationMs,
      plan
    };
  }

  /**
   * Build the audit context from inputs
   */
  private buildAuditContext(
    repoUrl: string,
    fileMap: any[],
    tier: string,
    githubToken: string | null,
    preflightRecord: any
  ): AuditContext {
    // Detect Capabilities based on file list
    const detectedStack = detectCapabilities(fileMap);

    const context: AuditContext = {
      repoUrl,
      files: fileMap.map(f => ({
        path: f.path,
        type: 'file',
        size: f.size,
        // Content is explicitly undefined here, agents must fetch it
        content: undefined as unknown as string,
        url: f.url
      })),
      tier,
      // Pass preflight data to agents - single source of truth
      preflight: preflightRecord ? {
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
      } : undefined,
      detectedStack, // Pass to agents if needed, but mainly for response
      githubToken: githubToken || undefined // Server-decrypted token (never leaves backend)
    };

    return context;
  }

  /**
   * Aggregate worker outputs, handling both fulfilled and rejected promises
   */
  private aggregateWorkerOutputs(workerOutputs: PromiseSettledResult<any>[]): {
    workerResults: WorkerResult[];
    swarmTokenUsage: number;
    failedWorkers: number;
  } {
    const workerResults: WorkerResult[] = [];
    let swarmTokenUsage = 0;
    let failedWorkers = 0;

    workerOutputs.forEach((out, i) => {
      if (out.status === 'fulfilled') {
        workerResults.push(out.value.result);
        swarmTokenUsage += out.value.usage.totalTokens;
      } else {
        failedWorkers++;
        console.warn(`⚠️ Worker ${i} failed:`, out.reason);
      }
    });

    return { workerResults, swarmTokenUsage, failedWorkers };
  }
}
