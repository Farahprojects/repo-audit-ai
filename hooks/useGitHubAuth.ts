import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { useAuth } from './useAuth';
import { ErrorHandler, ErrorLogger } from '../services/errorService';
import { GitHubOAuthService } from '../services/auth/GitHubOAuthService';
import { TokenService } from '../services/auth/TokenService';

interface GitHubAccount {
    id: string;
    user_id: string;
    github_user_id: number;
    login: string;
    avatar_url: string | null;
    html_url: string | null;
    access_token_encrypted: string;
    created_at: string;
    updated_at: string;
}

interface GitHubAuthState {
    isConnected: boolean;
    isConnecting: boolean;
    token: string | null;
    error: string | null;
    account: GitHubAccount | null;
}

export function useGitHubAuth() {
    const { session } = useAuth();
    const [state, setState] = useState<GitHubAuthState>({
        isConnected: false,
        isConnecting: false,
        token: null,
        error: null,
        account: null,
    });

    // Fetch GitHub account data
    const fetchGitHubAccount = useCallback(async () => {
        if (!session?.user?.id) {
            ErrorLogger.debug('Skipping GitHub account fetch - no user session');
            return;
        }

        try {
            const result = await ErrorHandler.safeAsync(
                async () => {
                    const { data, error } = await supabase
                        .from('github_accounts')
                        .select('*')
                        .eq('user_id', session.user.id)
                        .maybeSingle();

                    if (error) {
                        // Only treat "not found" as non-error (expected for new users)
                        if (error.code !== 'PGRST116') {
                            throw new Error(`Database error: ${error.message}`);
                        }
                        return null; // No account found - this is normal
                    }

                    return data;
                },
                null, // fallback to null
                { userId: session.user.id, operation: 'fetchGitHubAccount' }
            );

            if (result.success) {
                if (result.data) {
                    ErrorLogger.debug('GitHub account found');
                    setState(prev => ({
                        ...prev,
                        isConnected: true,
                        account: result.data as GitHubAccount,
                        error: null,
                    }));
                } else {
                    ErrorLogger.debug('No GitHub account found for user');
                    setState(prev => ({
                        ...prev,
                        isConnected: false,
                        account: null,
                        token: null,
                        error: null,
                    }));
                }
            } else if (result.success === false) {
                ErrorLogger.warn('Failed to fetch GitHub account', result.error);
                setState(prev => ({
                    ...prev,
                    isConnected: false,
                    account: null,
                    token: null,
                    error: result.error.message,
                }));
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error in fetchGitHubAccount');
            ErrorLogger.error('Unexpected error in fetchGitHubAccount', error);
            setState(prev => ({
                ...prev,
                error: 'Failed to load GitHub account data',
            }));
        }
    }, [session?.user?.id]);

    // Fetch account on mount and when session changes
    useEffect(() => {
        fetchGitHubAccount();
    }, [session?.user?.id]); // Only depend on user ID, not the callback

    // Get decrypted GitHub token using TokenService
    const getGitHubToken = useCallback(async (): Promise<string | null> => {
        if (!state.account?.access_token_encrypted || !state.account?.id) {
            ErrorLogger.debug('No encrypted token available');
            return null;
        }

        const token = await TokenService.getDecryptedToken(
            state.account.access_token_encrypted,
            state.account.id
        );

        if (!token) {
            setState(prev => ({
                ...prev,
                error: 'Failed to access GitHub token',
                token: null,
            }));
        }

        return token;

    }, [state.account]);

    // Sign in with GitHub OAuth using GitHubOAuthService
    const signInWithGitHub = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        const result = await GitHubOAuthService.startOAuthFlow();

        if (result.success) {
            await fetchGitHubAccount();
            setState(prev => ({ ...prev, isConnecting: false, error: null }));
            return { success: true };
        } else {
            const errorMsg = result.error || 'Failed to connect GitHub account';
            setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
            return { success: false, error: errorMsg };
        }
    }, [fetchGitHubAccount]);

    // Disconnect GitHub
    // Keeping this logic here as it manages direct DB deletion related to the user session
    // Could eventually be moved to a UserAccountService
    const disconnectGitHub = useCallback(async () => {
        if (!state.account) {
            ErrorLogger.warn('Attempted to disconnect GitHub account but no account found');
            return false;
        }

        if (!confirm('Are you sure you want to disconnect your GitHub account? You will need to reconnect to access repositories.')) {
            ErrorLogger.info('User cancelled GitHub account disconnection');
            return false;
        }

        try {
            const result = await ErrorHandler.safeAsync(
                async () => {
                    const { error } = await (supabase
                        .from('github_accounts' as any)
                        .delete()
                        .eq('user_id', state.account!.user_id) as unknown as Promise<{ error: any }>);

                    if (error) {
                        throw new Error(`Database deletion failed: ${error.message}`);
                    }
                },
                undefined,
                { userId: state.account.user_id, accountId: state.account.id, operation: 'disconnectGitHub' }
            );

            if (result.success) {
                ErrorLogger.info('GitHub account disconnected successfully');
                setState(prev => ({
                    ...prev,
                    isConnected: false,
                    account: null,
                    token: null,
                    error: null,
                }));
                GitHubOAuthService.clearOAuthState();
                return true;
            } else if (result.success === false) {
                ErrorLogger.error('Failed to disconnect GitHub account', result.error);
                setState(prev => ({ ...prev, error: result.error.message }));
                return false;
            }
            return false;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error during GitHub disconnection');
            ErrorLogger.error('Unexpected error disconnecting GitHub account', error, { accountId: state.account.id });
            setState(prev => ({ ...prev, error: 'An unexpected error occurred while disconnecting' }));
            return false;
        }
    }, [state.account]);

    // Clear all GitHub auth state (used on logout)
    const clearGitHubState = useCallback(() => {
        ErrorLogger.debug('Clearing GitHub auth state');
        setState({
            isConnected: false,
            isConnecting: false,
            token: null,
            error: null,
            account: null,
        });
        GitHubOAuthService.clearOAuthState();
    }, []);

    return {
        isGitHubConnected: state.isConnected,
        isConnecting: state.isConnecting,
        error: state.error,
        account: state.account,
        getGitHubToken,
        signInWithGitHub,
        disconnectGitHub,
        clearGitHubState,
    };
}
