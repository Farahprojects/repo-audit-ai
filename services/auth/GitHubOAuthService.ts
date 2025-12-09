import { supabase } from '../../src/integrations/supabase/client';
import { ErrorLogger } from '../errorService';

export interface OAuthResult {
    success: boolean;
    error?: string;
}

export class GitHubOAuthService {
    private static readonly WINDOW_WIDTH = 600;
    private static readonly WINDOW_HEIGHT = 700;
    private static readonly STORAGE_KEY_STATE = 'github_oauth_state';
    private static readonly STORAGE_KEY_RESULT = 'github_oauth_result';

    /**
     * Initiates the GitHub OAuth flow via a popup window.
     */
    static async startOAuthFlow(): Promise<OAuthResult> {
        ErrorLogger.info('Starting GitHub OAuth flow (Service)');

        return new Promise(async (resolve) => {
            try {
                // 1. Get OAuth URL from Edge Function
                const { data, error: invokeError } = await supabase.functions.invoke('github-oauth-start');

                if (invokeError) {
                    const error = new Error(`Failed to start OAuth: ${invokeError.message}`);
                    ErrorLogger.error('GitHub OAuth initiation failed', error, { invokeError });
                    return resolve({ success: false, error: 'Failed to initiate GitHub connection. Please try again.' });
                }

                if (!data?.url || !data?.state) {
                    const error = new Error('OAuth service returned invalid response - missing URL or state');
                    ErrorLogger.error('Invalid OAuth service response', error, { data });
                    return resolve({ success: false, error: 'OAuth service error. Please try again.' });
                }

                const authUrl = data.url;
                const stateToken = data.state;

                // 2. Store state for verification
                sessionStorage.setItem(this.STORAGE_KEY_STATE, stateToken);

                // 3. Open Popup
                const left = window.screen.width / 2 - this.WINDOW_WIDTH / 2;
                const top = window.screen.height / 2 - this.WINDOW_HEIGHT / 2;

                const popup = window.open(
                    authUrl,
                    'github-oauth',
                    `width=${this.WINDOW_WIDTH},height=${this.WINDOW_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes,location=no,directories=no,status=no`
                );

                if (!popup) {
                    ErrorLogger.warn('OAuth popup blocked');
                    return resolve({ success: false, error: 'Popup blocked. Please allow popups for this site and try again.' });
                }

                // 4. Handle Popup Events
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
                    if (!popup.closed) popup.close();
                    ErrorLogger.info('GitHub OAuth completed successfully');
                    resolve({ success: true });
                };

                const handleError = (errorMsg: string) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    if (!popup.closed) popup.close();
                    const error = new Error(errorMsg);
                    ErrorLogger.error('GitHub OAuth failed', error);
                    resolve({ success: false, error: errorMsg });
                };

                const messageHandler = (event: MessageEvent) => {
                    if (resolved) return;
                    // Validate origin if possible, but for now rely on content
                    if (event.data?.type === 'github-oauth-success') {
                        handleSuccess();
                    } else if (event.data?.type === 'github-oauth-error') {
                        handleError(event.data.message || 'Failed to connect GitHub account');
                    }
                };

                const storageHandler = (event: StorageEvent) => {
                    if (resolved) return;
                    if (event.key === this.STORAGE_KEY_RESULT && event.newValue) {
                        try {
                            const result = JSON.parse(event.newValue);
                            localStorage.removeItem(this.STORAGE_KEY_RESULT);

                            if (result.type === 'github-oauth-success') {
                                handleSuccess();
                            } else if (result.type === 'github-oauth-error') {
                                handleError(result.message || 'Failed to connect GitHub account');
                            }
                        } catch (e) {
                            console.error('[GitHubOAuthService] Failed to parse storage result:', e);
                        }
                    }
                };

                window.addEventListener('message', messageHandler);
                window.addEventListener('storage', storageHandler);

                // Fallback: Check localStorage manually (for missed events)
                const checkClosed = setInterval(() => {
                    if (resolved) return;

                    const stored = localStorage.getItem(this.STORAGE_KEY_RESULT);
                    if (stored) {
                        try {
                            const result = JSON.parse(stored);
                            localStorage.removeItem(this.STORAGE_KEY_RESULT);
                            if (result.type === 'github-oauth-success') handleSuccess();
                            else if (result.type === 'github-oauth-error') handleError(result.message || 'Failed');
                        } catch { }
                    }

                    if (popup.closed && !resolved) {
                        // Give a short grace period for storage/message events
                        setTimeout(() => {
                            if (!resolved) {
                                resolved = true;
                                cleanup();
                                // Assume cancellation if closed without success signal
                                resolve({ success: false, error: 'Authorization cancelled' });
                            }
                        }, 500);
                    }
                }, 500);

                // Timeout
                const timeout = setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    if (!popup.closed) popup.close();
                    ErrorLogger.error('OAuth timeout');
                    resolve({ success: false, error: 'Authorization timed out' });
                }, 5 * 60 * 1000);

            } catch (err) {
                const error = err instanceof Error ? err : new Error('Unknown OAuth error');
                ErrorLogger.critical('Unexpected error in GitHub OAuth flow', error);
                resolve({ success: false, error: 'An unexpected error occurred during GitHub connection.' });
            }
        });
    }

    static clearOAuthState() {
        sessionStorage.removeItem(this.STORAGE_KEY_STATE);
        localStorage.removeItem(this.STORAGE_KEY_RESULT);
    }
}
