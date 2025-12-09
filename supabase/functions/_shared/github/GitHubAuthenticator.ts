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

    async getAuthenticatedToken(userToken: string | undefined, authHeader: string | null, owner?: string): Promise<string | null> {
        // 1. Check direct user token first
        if (userToken) {
            return userToken;
        }

        // 2. If no direct token, try to get it from the user's GitHub account via Supabase
        if (owner && authHeader) {
            return this.retrieveStoredToken(authHeader);
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
            // @ts-ignore
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
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
            if (decryptedToken) {
            }
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

            // Decode JWT to get user_id
            let userId: string | null = null;
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    const paddedBase64 = base64 + '='.repeat((4 - base64.length % 4) % 4);
                    const decoded = atob(paddedBase64);
                    const payload = JSON.parse(decoded);
                    userId = payload.sub;
                }
            } catch (e) {
                console.error('Failed to decode JWT for user lookup');
                return null;
            }

            if (userId) {
                // Import Supabase client - @ts-ignore for ESM URL imports
                // @ts-ignore
                const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
                const supabase = createClient(
                    Deno.env.get('SUPABASE_URL')!,
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
                );

                // Get user's GitHub account
                const { data: githubAccount, error } = await supabase
                    .from('github_accounts')
                    .select('access_token_encrypted')
                    .eq('user_id', userId)
                    .single();

                if (!error && githubAccount) {
                    return this.decryptToken(githubAccount.access_token_encrypted);
                }
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
