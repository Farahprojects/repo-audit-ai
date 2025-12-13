// @ts-ignore - Deno types are available at runtime in Supabase Edge Functions
declare const Deno: { env: { get(key: string): string | undefined } };

export class GitHubAuthenticator {
    private static instance: GitHubAuthenticator;

    private constructor() { }

    static getInstance(): GitHubAuthenticator {
        if (!GitHubAuthenticator.instance) {
            GitHubAuthenticator.instance = new GitHubAuthenticator();
        }
        return GitHubAuthenticator.instance;
    }

    /**
     * Get authenticated GitHub token from Authorization header
     * SECURITY: Never accepts tokens from request body - only from headers or database
     */
    async getAuthenticatedToken(authHeader: string | null, owner?: string): Promise<string | null> {
        // Try to get token from the user's stored GitHub account via Supabase auth
        if (owner && authHeader) {
            return await this.retrieveStoredToken(authHeader);
        }

        return null;
    }

    /**
     * NEW: Get token from preflight's github_account_id
     * This is the preferred method for the new preflight system.
     * The token is decrypted server-side and never leaves the backend.
     */
    async getTokenByAccountId(githubAccountId: string): Promise<string | null> {
        if (!githubAccountId) {
            return null;
        }

        try {
            // @ts-ignore: Supabase types not available in Deno environment
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );

            // Get GitHub account by ID
            const { data: githubAccount, error } = await supabase
                .from('github_accounts')
                .select('access_token_encrypted')
                .eq('id', githubAccountId)
                .single();

            if (error || !githubAccount) {
                console.error(`❌ [GitHubAuthenticator] Failed to fetch GitHub account: ${githubAccountId}`, error);
                return null;
            }

            if (!githubAccount.access_token_encrypted) {
                console.warn(`⚠️ [GitHubAuthenticator] GitHub account ${githubAccountId} has no encrypted token`);
                return null;
            }

            // Decrypt server-side
            const decryptedToken = await this.decryptToken(githubAccount.access_token_encrypted);
            return decryptedToken;

        } catch (error) {
            console.error('❌ [GitHubAuthenticator] Error getting token by account ID:', error);
            return null;
        }
    }

    private async retrieveStoredToken(authHeader: string): Promise<string | null> {
        try {
            if (!authHeader) return null;

            const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
            if (!token) return null;

            // Import Supabase client - @ts-ignore for ESM URL imports
            // @ts-ignore: Supabase types not available in Deno environment
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL')!,
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );

            // Securely get authenticated user ID using Supabase auth
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (authError || !user) {
                console.error('Failed to authenticate user:', authError);
                return null;
            }

            const userId = user.id;

            // Get user's GitHub account
            const { data: githubAccount, error } = await supabase
                .from('github_accounts')
                .select('access_token_encrypted')
                .eq('user_id', userId)
                .single();

            if (!error && githubAccount) {
                return this.decryptToken(githubAccount.access_token_encrypted);
            }
        } catch (error) {
            console.error('Error retrieving user GitHub token:', error);
        }
        return null;
    }

    private async decryptToken(encryptedToken: string): Promise<string | null> {
        // Decrypt token server-side using dedicated encryption key
        const secret = Deno.env.get('TOKEN_ENCRYPTION_KEY')!;

        try {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
            const salt = combined.slice(0, 16);
            const iv = combined.slice(16, 28);
            const encrypted = combined.slice(28);

            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(secret),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );

            return decoder.decode(decrypted);
        } catch (decryptError) {
            console.error('Failed to decrypt GitHub token:', decryptError);
            return null;
        }
    }
}
