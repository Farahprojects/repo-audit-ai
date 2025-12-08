import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { useAuth } from './useAuth';
import { ErrorHandler, ErrorLogger } from '../services/errorService';
import { AuthenticationError } from '../types';

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
                    ErrorLogger.debug('GitHub account found', { userId: session.user.id, login: result.data.login });
                    setState(prev => ({
                        ...prev,
                        isConnected: true,
                        account: result.data as GitHubAccount,
                        error: null,
                    }));
                } else {
                    ErrorLogger.debug('No GitHub account found for user', { userId: session.user.id });
                    setState(prev => ({
                        ...prev,
                        isConnected: false,
                        account: null,
                        token: null,
                        error: null,
                    }));
                }
            } else if (result.success === false) {
                ErrorLogger.warn('Failed to fetch GitHub account', result.error, { userId: session.user.id });
                setState(prev => ({
                    ...prev,
                    isConnected: false,
                    account: null,
                    token: null,
                    error: result.error.message,
                }));
            }
        } catch (err) {
            // This should not happen due to safeAsync, but just in case
            const error = err instanceof Error ? err : new Error('Unknown error in fetchGitHubAccount');
            ErrorLogger.error('Unexpected error in fetchGitHubAccount', error, { userId: session.user.id });
            setState(prev => ({
                ...prev,
                error: 'Failed to load GitHub account data',
            }));
        }
    }, [session?.user?.id]);

    // Fetch account on mount and when session changes
    useEffect(() => {
        fetchGitHubAccount();
    }, [fetchGitHubAccount]);

    // Get decrypted GitHub token
    const getGitHubToken = useCallback(async (): Promise<string | null> => {
        if (!state.account?.access_token_encrypted) {
            ErrorLogger.debug('No encrypted token available');
            return null;
        }

        try {
            const result = await ErrorHandler.safeAsync(
                async () => {
                    const { data, error } = await supabase.functions.invoke('decrypt-github-token', {
                        body: { encryptedToken: state.account.access_token_encrypted }
                    });

                    if (error) {
                        throw new AuthenticationError(`Token decryption failed: ${error.message}`, {
                            operation: 'decryptToken',
                            accountId: state.account?.id
                        });
                    }

                    if (!data?.token) {
                        throw new AuthenticationError('No token received from decryption service', {
                            operation: 'decryptToken',
                            accountId: state.account?.id
                        });
                    }

                    return data.token;
                },
                null,
                { accountId: state.account?.id, operation: 'getGitHubToken' }
            );

            if (result.success) {
                ErrorLogger.debug('GitHub token decrypted successfully');
                return result.data;
            } else if (result.success === false) {
                ErrorLogger.error('Failed to decrypt GitHub token', result.error);
                // Update state to reflect the error
                setState(prev => ({
                    ...prev,
                    error: result.error.message,
                    token: null,
                }));
                return null;
            }
            return null;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error getting GitHub token');
            ErrorLogger.error('Unexpected error in getGitHubToken', error, { accountId: state.account?.id });
            setState(prev => ({
                ...prev,
                error: 'Failed to access GitHub token',
                token: null,
            }));
            return null;
        }
    }, [state.account]);

    // Sign in with GitHub OAuth using popup flow
    // Returns a Promise that resolves when OAuth completes (success or error)
    const signInWithGitHub = useCallback((): Promise<{ success: boolean; error?: string }> => {
        ErrorLogger.info('Starting GitHub OAuth flow');
        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        return new Promise(async (resolve) => {
            try {
                // Call edge function to get OAuth URL
                const { data, error: invokeError } = await supabase.functions.invoke('github-oauth-start');

                if (invokeError) {
                    const error = new Error(`Failed to start OAuth: ${invokeError.message}`);
                    ErrorLogger.error('GitHub OAuth initiation failed', error, { invokeError });
                    const errorMsg = 'Failed to initiate GitHub connection. Please try again.';
                    setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                    resolve({ success: false, error: errorMsg });
                    return;
                }

                if (!data?.url || !data?.state) {
                    const error = new Error('OAuth service returned invalid response - missing URL or state');
                    ErrorLogger.error('Invalid OAuth service response', error, { data });
                    const errorMsg = 'OAuth service error. Please try again.';
                    setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                    resolve({ success: false, error: errorMsg });
                    return;
                }

                const authUrl = data.url;
                const stateToken = data.state;

                // Store state in sessionStorage for verification
                sessionStorage.setItem('github_oauth_state', stateToken);

                // Open in popup window
                const width = 600;
                const height = 700;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;

                const popup = window.open(
                    authUrl,
                    'github-oauth',
                    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes,location=no,directories=no,status=no`
                );

                if (!popup) {
                    const error = new Error('Browser blocked OAuth popup - popups may be disabled');
                    ErrorLogger.warn('OAuth popup blocked', error);
                    const errorMsg = 'Popup blocked. Please allow popups for this site and try again.';
                    setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                    resolve({ success: false, error: errorMsg });
                    return;
                }

                let resolved = false;

                const cleanup = () => {
                    clearInterval(checkClosed);
                    clearTimeout(timeout);
                    window.removeEventListener('message', messageHandler);
                    window.removeEventListener('storage', storageHandler);
                };

                const handleSuccess = () => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    popup.close();
                    ErrorLogger.info('GitHub OAuth completed successfully');

                    fetchGitHubAccount().then(() => {
                        setState(prev => ({ ...prev, isConnecting: false, error: null }));
                        resolve({ success: true });
                    }).catch((error) => {
                        ErrorLogger.error('Failed to refresh account after OAuth success', error);
                        // Still resolve as success since OAuth worked
                        setState(prev => ({ ...prev, isConnecting: false, error: null }));
                        resolve({ success: true });
                    });
                };

                const handleError = (errorMsg: string) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    popup.close();
                    const error = new Error(errorMsg);
                    ErrorLogger.error('GitHub OAuth failed', error);
                    setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                    resolve({ success: false, error: errorMsg });
                };

                // Method 1: Listen for postMessage from popup
                const messageHandler = (event: MessageEvent) => {
                    if (resolved) return;
                    if (event.data?.type === 'github-oauth-success') {
                        handleSuccess();
                    } else if (event.data?.type === 'github-oauth-error') {
                        handleError(event.data.message || 'Failed to connect GitHub account');
                    }
                };

                // Method 2: Listen for localStorage changes (fallback for cross-origin)
                const storageHandler = (event: StorageEvent) => {
                    if (resolved) return;
                    if (event.key === 'github_oauth_result' && event.newValue) {
                        try {
                            const result = JSON.parse(event.newValue);
                            localStorage.removeItem('github_oauth_result'); // Clean up
                            
                            if (result.type === 'github-oauth-success') {
                                handleSuccess();
                            } else if (result.type === 'github-oauth-error') {
                                handleError(result.message || 'Failed to connect GitHub account');
                            }
                        } catch (e) {
                            console.error('[useGitHubAuth] Failed to parse storage result:', e);
                        }
                    }
                };

                window.addEventListener('message', messageHandler);
                window.addEventListener('storage', storageHandler);

                // Check for existing localStorage result (in case storage event was missed)
                const checkLocalStorage = () => {
                    if (resolved) return;
                    const stored = localStorage.getItem('github_oauth_result');
                    if (stored) {
                        try {
                            const result = JSON.parse(stored);
                            localStorage.removeItem('github_oauth_result');
                            
                            if (result.type === 'github-oauth-success') {
                                handleSuccess();
                            } else if (result.type === 'github-oauth-error') {
                                handleError(result.message || 'Failed to connect GitHub account');
                            }
                        } catch (e) {
                            console.error('[useGitHubAuth] Failed to parse stored result:', e);
                        }
                    }
                };

                // Fallback: check if popup closed manually (user cancelled)
                const checkClosed = setInterval(() => {
                    if (resolved) return;
                    
                    // Also check localStorage periodically
                    checkLocalStorage();
                    
                    if (popup.closed) {
                        // Give a brief moment for storage events to fire
                        setTimeout(() => {
                            if (resolved) return;
                            checkLocalStorage();
                            
                            if (!resolved) {
                                resolved = true;
                                cleanup();
                                console.log('⚠️ [useGitHubAuth] Popup closed, checking account...');
                                
                                fetchGitHubAccount().then(() => {
                                    setState(prev => {
                                        const wasSuccessful = prev.isConnected;
                                        if (wasSuccessful) {
                                            resolve({ success: true });
                                        } else {
                                            resolve({ success: false, error: 'Authorization cancelled or failed' });
                                        }
                                        return { ...prev, isConnecting: false };
                                    });
                                });
                            }
                        }, 300);
                    }
                }, 500);

                // Timeout after 5 minutes
                const timeout = setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    if (!popup.closed) popup.close();
                    console.error('⏱️ [useGitHubAuth] OAuth timeout');
                    setState(prev => ({ ...prev, isConnecting: false }));
                    resolve({ success: false, error: 'Authorization timed out' });
                }, 5 * 60 * 1000);

            } catch (err) {
                const error = err instanceof Error ? err : new Error('Unknown OAuth error');
                ErrorLogger.critical('Unexpected error in GitHub OAuth flow', error);
                const errorMsg = 'An unexpected error occurred during GitHub connection. Please try again.';
                setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                resolve({ success: false, error: errorMsg });
            }
        });
    }, [fetchGitHubAccount]);

    // Disconnect GitHub
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
                        .eq('user_id', state.account.user_id) as unknown as Promise<{ error: any }>);

                    if (error) {
                        throw new Error(`Database deletion failed: ${error.message}`);
                    }
                },
                undefined,
                { userId: state.account.user_id, accountId: state.account.id, operation: 'disconnectGitHub' }
            );

            if (result.success) {
                ErrorLogger.info('GitHub account disconnected successfully', { userId: state.account.user_id });
                setState(prev => ({
                    ...prev,
                    isConnected: false,
                    account: null,
                    token: null,
                    error: null,
                }));
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
        // Clear any OAuth-related storage
        sessionStorage.removeItem('github_oauth_state');
        localStorage.removeItem('github_oauth_result');
    }, []);

    // Return individual values to prevent unnecessary re-renders
    // Components can now selectively subscribe to only the values they need
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
