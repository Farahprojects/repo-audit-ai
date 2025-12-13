// Preflight Service - Handles preflight data fetching and token decryption
// Follows Single Responsibility Principle: Only manages preflight operations

import { createSupabaseClient } from '../utils.ts';
import { GitHubAuthenticator } from '../github/GitHubAuthenticator.ts';
import { ValidatedRequest } from './RequestValidationService.ts';
import { ErrorTrackingService } from './ErrorTrackingService.ts';

export interface ResolvedPreflight {
  record: any;
  effectiveGitHubToken: string | null;
}

export class PreflightService {
  private supabase: any;

  constructor(supabaseClient: any) {
    this.supabase = supabaseClient;
  }

  /**
   * Resolve preflight data and decrypt tokens
   */
  async resolvePreflight(validatedRequest: ValidatedRequest): Promise<ResolvedPreflight> {
    let preflightRecord = validatedRequest.preflightRecord;

    // Fetch preflight from database if ID provided
    if (validatedRequest.preflightId && !preflightRecord) {
      preflightRecord = await this.fetchPreflightById(validatedRequest.preflightId);
    }

    // Decrypt GitHub token if available
    const effectiveGitHubToken = await this.resolveGitHubToken(preflightRecord, validatedRequest.githubToken);

    return {
      record: preflightRecord,
      effectiveGitHubToken
    };
  }

  /**
   * Fetch preflight record by ID
   */
  private async fetchPreflightById(preflightId: string): Promise<any> {
    const { data: fetchedPreflight, error: preflightError } = await this.supabase
      .from('preflights')
      .select('*')
      .eq('id', preflightId)
      .single();

    if (preflightError || !fetchedPreflight) {
      throw new Error('Invalid or expired preflight ID');
    }

    return fetchedPreflight;
  }

  /**
   * Resolve the effective GitHub token (server-decrypted or client-provided)
   */
  private async resolveGitHubToken(preflightRecord: any, clientToken?: string): Promise<string | null> {
    // SERVER-SIDE TOKEN DECRYPTION
    // If we have a preflight with a github_account_id, decrypt the token server-side
    let serverDecryptedToken: string | null = null;

    if (preflightRecord?.github_account_id && preflightRecord?.is_private) {
      const authenticator = GitHubAuthenticator.getInstance();
      serverDecryptedToken = await authenticator.getTokenByAccountId(preflightRecord.github_account_id);

      if (!serverDecryptedToken) {
        const errorMessage = `Failed to decrypt GitHub token for private repository`;
        console.error(`❌ [PreflightService] ${errorMessage} - private repo files will not be accessible`);

        // Track this critical failure for monitoring
        ErrorTrackingService.trackError(
          new Error(errorMessage),
          {
            component: 'PreflightService',
            operation: 'resolveGitHubToken',
            preflightId: preflightRecord.id,
            githubAccountId: preflightRecord.github_account_id,
            repoUrl: preflightRecord.repo_url,
            isPrivate: preflightRecord.is_private,
            severity: 'critical'
          }
        );
      }
    }

    // Use server-decrypted token, fall back to frontend-provided token (legacy), then null
    return serverDecryptedToken || clientToken || null;
  }
}






