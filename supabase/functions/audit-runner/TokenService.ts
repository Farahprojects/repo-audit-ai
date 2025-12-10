import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';

export class TokenService {
  private static authenticator = GitHubAuthenticator.getInstance();

  static async getEffectiveToken(
    preflightRecord: any,
    clientProvidedToken?: string
  ): Promise<string | null> {
    // SERVER-SIDE TOKEN DECRYPTION
    // If we have a preflight with a github_account_id, decrypt the token server-side
    // This eliminates the need for the frontend to handle decrypted tokens
    let serverDecryptedToken: string | null = null;

    if (preflightRecord?.github_account_id && preflightRecord?.is_private) {
      serverDecryptedToken = await this.authenticator.getTokenByAccountId(preflightRecord.github_account_id);

      if (!serverDecryptedToken) {
        console.warn(`⚠️ [TokenService] Failed to decrypt token - private repo files may not be accessible`);
      }
    }

    // Use server-decrypted token, fall back to frontend-provided token (legacy), then null
    return serverDecryptedToken || clientProvidedToken || null;
  }
}
