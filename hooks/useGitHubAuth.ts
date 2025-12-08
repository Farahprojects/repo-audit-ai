import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { useAuth } from './useAuth';

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

    // Handle OAuth completion from URL parameters (fallback for popup redirects)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const githubStatus = urlParams.get('github');
        const errorMessage = urlParams.get('message');

        if (githubStatus === 'connected') {
            console.log('🎉 OAuth success detected from URL parameters - updating GitHub connection state');
            // Clear URL parameters
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('github');
            window.history.replaceState({}, '', newUrl.toString());

            // Refetch GitHub account to update state
            fetchGitHubAccount().then(() => {
                console.log('🔄 [useGitHubAuth] GitHub account refetched after OAuth success');
                setState(prev => ({ ...prev, isConnecting: false, error: null }));
            });
        } else if (githubStatus === 'error') {
            console.log('❌ OAuth error detected from URL parameters:', errorMessage);
            // Clear URL parameters
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('github');
            newUrl.searchParams.delete('message');
            window.history.replaceState({}, '', newUrl.toString());

            setState(prev => ({
                ...prev,
                isConnecting: false,
                error: errorMessage || 'GitHub connection failed'
            }));
        }
    }, []);

    // Fetch GitHub account data
    const fetchGitHubAccount = useCallback(async () => {
        if (!session?.user?.id) return;

        try {
            const { data, error } = await supabase
                .from('github_accounts')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (error) {
                // Only log non-"not found" errors
                if (error.code !== 'PGRST116') {
                    console.error('Error fetching GitHub account:', error);
                }
                return;
            }

            if (data) {
                console.log('✅ [useGitHubAuth] GitHub account found, setting isConnected=true');
                setState(prev => ({
                    ...prev,
                    isConnected: true,
                    account: data as GitHubAccount,
                }));
            } else {
                console.log('❌ [useGitHubAuth] No GitHub account found, setting isConnected=false');
                setState(prev => ({
                    ...prev,
                    isConnected: false,
                    account: null,
                    token: null,
                }));
            }
        } catch (err) {
            console.error('Error in fetchGitHubAccount:', err);
        }
    }, [session?.user?.id]);

    // Fetch account on mount and when session changes
    useEffect(() => {
        fetchGitHubAccount();
    }, [fetchGitHubAccount]);

    // Get decrypted GitHub token
    const getGitHubToken = useCallback(async (): Promise<string | null> => {
        if (!state.account?.access_token_encrypted) return null;

        try {
            // Call edge function to decrypt token
            const { data, error } = await supabase.functions.invoke('decrypt-github-token', {
                body: { encryptedToken: state.account.access_token_encrypted }
            });

            if (error) {
                console.error('Error decrypting GitHub token:', error);
                return null;
            }

            return data.token;
        } catch (err) {
            console.error('Error getting GitHub token:', err);
            return null;
        }
    }, [state.account]);

    // Sign in with GitHub OAuth using popup flow
    const signInWithGitHub = useCallback(async (redirectTo?: string) => {
        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        try {
            // Call edge function to get OAuth URL
            const { data, error: invokeError } = await supabase.functions.invoke('github-oauth-start');

            if (invokeError) {
                console.error('Error starting GitHub OAuth:', invokeError);
                const errorMsg = 'Failed to initiate GitHub connection';
                setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                return { success: false, error: errorMsg };
            }

            if (!data?.url || !data?.state) {
                const errorMsg = 'Invalid response from OAuth service';
                setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                return { success: false, error: errorMsg };
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
                const errorMsg = 'Popup blocked. Please allow popups for this site.';
                setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                return { success: false, error: errorMsg };
            }

            // Listen for popup to close or navigate to our domain
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    // Check if connection was successful by refetching GitHub account
                    fetchGitHubAccount().then(() => {
                        setState(prev => ({ ...prev, isConnecting: false }));
                    });
                } else {
                    // Check if popup has navigated to our domain (OAuth redirect fallback)
                    try {
                        const popupUrl = popup.location.href;
                        if (popupUrl && popupUrl.includes(window.location.origin)) {
                            console.log('🔄 Popup redirected to our domain, closing...');
                            clearInterval(checkClosed);
                            popup.close();
                            // The useEffect above will handle the URL parameters
                            setTimeout(() => {
                                fetchGitHubAccount().then(() => {
                                    setState(prev => ({ ...prev, isConnecting: false }));
                                });
                            }, 1000); // Give time for the redirect to complete
                        }
                    } catch (e) {
                        // Cross-origin access will throw, ignore
                    }
                }
            }, 500);

            // Also listen for postMessage from popup
            const messageHandler = (event: MessageEvent) => {
                if (
                    event.data?.type === 'github-oauth-success' ||
                    event.data?.type === 'github-oauth-error'
                ) {
                    clearInterval(checkClosed);
                    popup.close();
                    window.removeEventListener('message', messageHandler);

                    if (event.data.type === 'github-oauth-success') {
                        // Refetch GitHub account
                        fetchGitHubAccount().then(() => {
                            setState(prev => ({ ...prev, isConnecting: false, error: null }));
                        });
                    } else {
                        const errorMsg = event.data.message || 'Failed to connect GitHub account';
                        setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
                    }
                }
            };

            window.addEventListener('message', messageHandler);

            // Cleanup after 5 minutes if still open
            setTimeout(
                () => {
                    if (!popup.closed) {
                        popup.close();
                        clearInterval(checkClosed);
                        window.removeEventListener('message', messageHandler);
                        setState(prev => ({ ...prev, isConnecting: false }));
                    }
                },
                5 * 60 * 1000
            );

            return { success: true };
        } catch (err) {
            console.error('Error in GitHub OAuth:', err);
            const errorMsg = 'Failed to connect to GitHub';
            setState(prev => ({ ...prev, isConnecting: false, error: errorMsg }));
            return { success: false, error: errorMsg };
        }
    }, [fetchGitHubAccount]);

    // Disconnect GitHub
    const disconnectGitHub = useCallback(async () => {
        if (!state.account) return false;

        if (!confirm('Are you sure you want to disconnect your GitHub account? You will need to reconnect to access repositories.')) {
            return false;
        }

        try {
            const { error } = await (supabase
                .from('github_accounts' as any)
                .delete()
                .eq('user_id', state.account.user_id) as unknown as Promise<{ error: any }>);

            if (error) {
                console.error('Failed to disconnect GitHub account:', error);
                setState(prev => ({ ...prev, error: 'Failed to disconnect GitHub account' }));
                return false;
            }

            setState(prev => ({
                ...prev,
                isConnected: false,
                account: null,
                token: null,
                error: null,
            }));

            return true;
        } catch (err) {
            console.error('Error disconnecting GitHub account:', err);
            const errorMsg = err instanceof Error ? err.message : 'Failed to disconnect GitHub account';
            setState(prev => ({ ...prev, error: errorMsg }));
            return false;
        }
    }, [state.account]);

    return {
        isGitHubConnected: state.isConnected,
        isConnecting: state.isConnecting,
        error: state.error,
        account: state.account,
        getGitHubToken,
        signInWithGitHub,
        disconnectGitHub,
    };
}
