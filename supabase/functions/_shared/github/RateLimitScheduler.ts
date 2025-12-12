// ============================================================================
// Rate Limit Scheduler
// ============================================================================
// Smart job scheduling based on available GitHub API rate limits
// Prevents jobs from failing due to rate limit exhaustion

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LoggerService } from '../services/LoggerService.ts';

export interface CapacityCheck {
  canProcess: boolean;
  waitUntil?: Date;
  availableCapacity: number;
  estimatedWaitMinutes?: number;
}

export class RateLimitScheduler {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // ============================================================================
  // Capacity Checking
  // ============================================================================

  /**
   * Check if we have capacity to process a job with the given API call estimate
   */
  async canProcessJob(
    installationId: number,
    estimatedCalls: number,
    bufferCalls = 100
  ): Promise<CapacityCheck> {
    const { data: limits, error } = await this.supabase
      .from('github_rate_limits')
      .select('*')
      .eq('installation_id', installationId)
      .eq('resource', 'core')
      .single();

    if (error) {
      LoggerService.warn('No rate limit data found, assuming default capacity', {
        component: 'RateLimitScheduler',
        installationId,
        error: error.message
      });

      // No rate limit tracking yet, assume we can proceed with default limits
      return {
        canProcess: true,
        availableCapacity: 5000 - bufferCalls
      };
    }

    const now = new Date();
    const resetAt = new Date(limits.reset_at);

    // If reset time has passed, limits have been refreshed
    if (resetAt <= now) {
      LoggerService.info('Rate limit reset time has passed, limits refreshed', {
        component: 'RateLimitScheduler',
        installationId,
        resetAt: limits.reset_at
      });

      return {
        canProcess: true,
        availableCapacity: limits.limit_total - bufferCalls
      };
    }

    // Check if we have enough remaining capacity
    const availableCapacity = limits.remaining - bufferCalls;

    if (availableCapacity >= estimatedCalls) {
      return {
        canProcess: true,
        availableCapacity
      };
    }

    // Not enough capacity, calculate wait time
    const waitMs = resetAt.getTime() - now.getTime();
    const waitUntil = new Date(now.getTime() + waitMs);

    LoggerService.info('Insufficient rate limit capacity', {
      component: 'RateLimitScheduler',
      installationId,
      required: estimatedCalls,
      available: availableCapacity,
      waitUntil: waitUntil.toISOString(),
      waitMinutes: Math.ceil(waitMs / (1000 * 60))
    });

    return {
      canProcess: false,
      waitUntil,
      availableCapacity: limits.remaining,
      estimatedWaitMinutes: Math.ceil(waitMs / (1000 * 60))
    };
  }

  // ============================================================================
  // Job Scheduling
  // ============================================================================

  /**
   * Schedule a job for the next available time slot
   */
  async scheduleJob(
    jobId: string,
    installationId: number,
    estimatedCalls: number
  ): Promise<{ scheduledAt: Date; reason: string }> {
    const capacity = await this.canProcessJob(installationId, estimatedCalls);

    if (capacity.canProcess) {
      // Can process immediately
      return {
        scheduledAt: new Date(),
        reason: 'sufficient_capacity'
      };
    }

    if (!capacity.waitUntil) {
      throw new Error('Cannot determine scheduling time - no rate limit data');
    }

    // Schedule for after rate limit reset, with a small buffer
    const scheduledAt = new Date(capacity.waitUntil.getTime() + 5000); // 5 second buffer

    // Update job in database
    const { error } = await this.supabase
      .from('audit_jobs')
      .update({
        status: 'pending',
        scheduled_at: scheduledAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      LoggerService.error('Failed to schedule job', error, {
        component: 'RateLimitScheduler',
        jobId,
        installationId
      });
      throw error;
    }

    LoggerService.info('Job rescheduled due to rate limits', {
      component: 'RateLimitScheduler',
      jobId,
      installationId,
      scheduledAt: scheduledAt.toISOString(),
      reason: 'rate_limit_exceeded'
    });

    return {
      scheduledAt,
      reason: 'rate_limit_exceeded'
    };
  }

  // ============================================================================
  // API Call Estimation
  // ============================================================================

  /**
   * Estimate API calls needed for a repository audit
   */
  estimateAPICalls(fileCount: number, options: {
    includeLanguages?: boolean;
    includeTree?: boolean;
    includeCommits?: boolean;
  } = {}): number {
    let calls = 0;

    // Base calls for repository metadata
    calls += 1; // Repository info

    if (options.includeLanguages) {
      calls += 1; // Languages endpoint
    }

    if (options.includeTree) {
      calls += 1; // Tree endpoint
    }

    // File content fetches (batched in groups of 5 to minimize calls)
    const fileBatches = Math.ceil(fileCount / 5);
    calls += fileBatches;

    if (options.includeCommits) {
      calls += 1; // Recent commits
    }

    return calls;
  }

  /**
   * Estimate API calls for a specific job based on preflight data
   */
  async estimateJobAPICalls(jobId: string): Promise<number> {
    // Get preflight data for this job
    const { data: job, error: jobError } = await this.supabase
      .from('audit_jobs')
      .select('preflight_id')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const { data: preflight, error: preflightError } = await this.supabase
      .from('preflights')
      .select('file_count, is_private')
      .eq('id', job.preflight_id)
      .single();

    if (preflightError || !preflight) {
      throw new Error(`Preflight not found: ${job.preflight_id}`);
    }

    const estimatedCalls = this.estimateAPICalls(preflight.file_count || 0, {
      includeLanguages: true,
      includeTree: true,
      includeCommits: false // We can skip commits for basic audits
    });

    // Update job with estimate
    await this.supabase
      .from('audit_jobs')
      .update({
        estimated_api_calls: estimatedCalls,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    return estimatedCalls;
  }

  // ============================================================================
  // Bulk Scheduling
  // ============================================================================

  /**
   * Get jobs that can be processed now across all installations
   */
  async getProcessableJobs(limit = 10): Promise<Array<{
    job_id: string;
    installation_id: number;
    estimated_calls: number;
    priority: number;
  }>> {
    // Get pending jobs with installation context
    const { data: jobs, error } = await this.supabase
      .from('audit_jobs')
      .select(`
        id,
        preflight_id,
        created_at,
        preflights!inner (
          installation_id,
          file_count
        )
      `)
      .eq('status', 'pending')
      .not('preflights.installation_id', 'is', null)
      .lte('scheduled_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(limit * 2); // Get more to filter

    if (error) {
      LoggerService.error('Failed to get processable jobs', error, {
        component: 'RateLimitScheduler'
      });
      return [];
    }

    const processableJobs: Array<{
      job_id: string;
      installation_id: number;
      estimated_calls: number;
      priority: number;
    }> = [];

    // Check capacity for each installation
    const installationCapacity = new Map<number, CapacityCheck>();

    for (const job of jobs || []) {
      const installationId = job.preflights.installation_id;
      const fileCount = job.preflights.file_count || 0;

      // Get or cache capacity check for this installation
      if (!installationCapacity.has(installationId)) {
        const estimatedCalls = this.estimateAPICalls(fileCount);
        const capacity = await this.canProcessJob(installationId, estimatedCalls);
        installationCapacity.set(installationId, capacity);
      }

      const capacity = installationCapacity.get(installationId)!;

      if (capacity.canProcess) {
        processableJobs.push({
          job_id: job.id,
          installation_id: installationId,
          estimated_calls: this.estimateAPICalls(fileCount),
          priority: this.calculateJobPriority(job)
        });
      }
    }

    // Sort by priority and return limit
    return processableJobs
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);
  }

  // ============================================================================
  // Job Priority Calculation
  // ============================================================================

  private calculateJobPriority(job: any): number {
    let priority = 0;

    // Higher priority for older jobs
    const ageHours = (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60);
    priority += Math.min(ageHours, 24); // Max 24 points for age

    // Higher priority for smaller jobs (less API calls)
    const fileCount = job.preflights.file_count || 0;
    if (fileCount < 100) priority += 10;
    else if (fileCount < 500) priority += 5;
    else if (fileCount < 1000) priority += 2;

    return priority;
  }

  // ============================================================================
  // Monitoring and Reporting
  // ============================================================================

  /**
   * Get rate limit status across all installations
   */
  async getRateLimitStatus(): Promise<Array<{
    installation_id: number;
    account_login: string;
    remaining: number;
    limit_total: number;
    percent_remaining: number;
    reset_at: string;
    minutes_until_reset: number;
  }>> {
    const { data, error } = await this.supabase
      .from('github_rate_limits')
      .select(`
        installation_id,
        remaining,
        limit_total,
        reset_at,
        github_app_installations!inner (
          account_login
        )
      `)
      .eq('resource', 'core');

    if (error) {
      LoggerService.error('Failed to get rate limit status', error, {
        component: 'RateLimitScheduler'
      });
      return [];
    }

    const now = Date.now();

    return (data || []).map(row => ({
      installation_id: row.installation_id,
      account_login: row.github_app_installations.account_login,
      remaining: row.remaining,
      limit_total: row.limit_total,
      percent_remaining: Math.round((row.remaining / row.limit_total) * 100),
      reset_at: row.reset_at,
      minutes_until_reset: Math.max(0, Math.ceil(
        (new Date(row.reset_at).getTime() - now) / (1000 * 60)
      ))
    }));
  }

  /**
   * Get API usage statistics
   */
  async getUsageStats(hours = 24): Promise<{
    total_calls: number;
    jobs_completed: number;
    average_calls_per_job: number;
    installations_used: number;
  }> {
    const since = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const { data, error } = await this.supabase
      .from('audit_jobs')
      .select('actual_api_calls, installation_id')
      .eq('status', 'completed')
      .gte('completed_at', since)
      .not('installation_id', 'is', null);

    if (error) {
      LoggerService.error('Failed to get usage stats', error, {
        component: 'RateLimitScheduler'
      });
      return {
        total_calls: 0,
        jobs_completed: 0,
        average_calls_per_job: 0,
        installations_used: 0
      };
    }

    const jobs = data || [];
    const totalCalls = jobs.reduce((sum, job) => sum + (job.actual_api_calls || 0), 0);
    const installations = new Set(jobs.map(job => job.installation_id));

    return {
      total_calls: totalCalls,
      jobs_completed: jobs.length,
      average_calls_per_job: jobs.length > 0 ? Math.round(totalCalls / jobs.length) : 0,
      installations_used: installations.size
    };
  }
}