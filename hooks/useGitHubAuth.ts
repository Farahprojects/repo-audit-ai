import { useState, useCallback } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { useAuth } from './useAuth';

interface GitHubAuthState {
    isConnected: boolean;
    isConnecting: boolean;
    token: string | null;
    error: string | null;
}

export function useGitHubAuth() {
    const { session } = useAuth();
    const [state, setState] = useState<GitHubAuthState>({
        isConnected: false,
        isConnecting: false,
        token: null,
        error: null,
    });

    // Check if user has GitHub connected by looking at provider_token
    const isGitHubConnected = !!session?.provider_token && session?.user?.app_metadata?.provider === 'github';

    // Get GitHub token from session
    const getGitHubToken = useCallback((): string | null => {
        if (session?.provider_token && session?.user?.app_metadata?.provider === 'github') {
            return session.provider_token;
        }
        return null;
    }, [session]);

    // Sign in with GitHub OAuth - request repo scope for private repos
    const signInWithGitHub = useCallback(async (redirectTo?: string) => {
        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        try {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    scopes: 'repo read:org', // repo includes read access to private repos
                    redirectTo: redirectTo || window.location.origin + window.location.pathname,
                },
            });

            if (error) {
                setState(prev => ({ ...prev, isConnecting: false, error: error.message }));
                return { success: false, error: error.message };
            }

            // OAuth redirect will happen, state update won't persist
            return { success: true, url: data.url };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to connect GitHub';
            setState(prev => ({ ...prev, isConnecting: false, error: message }));
            return { success: false, error: message };
        }
    }, []);

    // Disconnect GitHub (sign out if GitHub is the only auth method)
    const disconnectGitHub = useCallback(async () => {
        // For now, just clear the state - user would need to re-auth
        setState({
            isConnected: false,
            isConnecting: false,
            token: null,
            error: null,
        });
    }, []);

    return {
        isGitHubConnected,
        isConnecting: state.isConnecting,
        error: state.error,
        getGitHubToken,
        signInWithGitHub,
        disconnectGitHub,
    };
}
