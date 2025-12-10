import { runPlanner } from '../_shared/agents/planner.ts';
import { runWorker } from '../_shared/agents/worker.ts';
import { runMetadataAnalyst } from '../_shared/agents/MetadataAnalyst.ts';
import { AuditContext, WorkerResult } from '../_shared/agents/types.ts';

export interface OrchestrationResult {
  plan: any;
  swarmResults: WorkerResult[];
  totalTokens: number;
  durationMs: number;
  failedWorkers: number;
  plannerUsage: any;
}

export class AuditOrchestrator {
  private geminiApiKey: string;

  constructor(geminiApiKey: string) {
    this.geminiApiKey = geminiApiKey;
  }

  async executeSwarmPipeline(context: AuditContext, tierPrompt: string): Promise<OrchestrationResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${'='.repeat(60)}\n`);

    // 1. MAP PHASE: The Planner (CEO)
    const { result: plan, usage: plannerUsage } = await runPlanner(context, this.geminiApiKey, tierPrompt);
    plan.tasks.forEach((t, i) => {
      // Log task details if needed
    });

    // 2. WORKER PHASE: The Swarm (Parallel Execution)
    const timeStart = Date.now();

    const workerPromises = plan.tasks.map(async (task) => {
      return runWorker(context, task, this.geminiApiKey);
    });

    // Use Promise.allSettled for robust error handling - one worker failure won't lose all results
    const workerOutputs = await Promise.allSettled(workerPromises);

    // Aggregate Results & Token Usage (handle both fulfilled and rejected)
    const swarmResults: WorkerResult[] = [];
    let swarmTokenUsage = 0;
    let failedWorkers = 0;

    workerOutputs.forEach((out, i) => {
      if (out.status === 'fulfilled') {
        swarmResults.push(out.value.result);
        swarmTokenUsage += out.value.usage.totalTokens;
      } else {
        failedWorkers++;
        console.warn(`⚠️ Worker ${i} failed:`, out.reason);
      }
    });

    if (failedWorkers > 0) {
      console.warn(`⚠️ ${failedWorkers}/${workerOutputs.length} workers failed. Continuing with ${swarmResults.length} results.`);
    }

    // 3. AGGREGATE PHASE: Direct aggregation from worker results (no synthesizer)
    const timeEnd = Date.now();
    const durationMs = timeEnd - timeStart;

    // Total Tokens (planner + workers only, no synthesizer)
    const totalTokens = (plannerUsage?.totalTokens || 0) + swarmTokenUsage;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      plan,
      swarmResults,
      totalTokens,
      durationMs,
      failedWorkers,
      plannerUsage
    };
  }

  async executeMetadataAnalysis(context: AuditContext): Promise<OrchestrationResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`METADATA ANALYSIS - FREE TIER`);
    console.log(`${'='.repeat(60)}\n`);

    const timeStart = Date.now();

    // Run the single metadata analyst agent
    const result = await runMetadataAnalyst(context, this.geminiApiKey);

    const timeEnd = Date.now();
    const durationMs = timeEnd - timeStart;

    // Construct a pseudo-OrchestrationResult
    return {
      plan: { focusArea: "Metadata Audit", tasks: [] }, // No complex plan
      swarmResults: [result.result],
      totalTokens: result.usage.totalTokens, // Only one agent
      durationMs,
      failedWorkers: 0,
      plannerUsage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 }
    };
  }
}
