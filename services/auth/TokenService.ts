import { supabase } from '../../src/integrations/supabase/client';
import { ErrorLogger, ErrorHandler } from '../errorService';
import { AuthenticationError } from '../../types';

export class TokenService {
    /**
     * securely retrieves the decrypted GitHub access token from the backend.
     * The token is never stored in persistent local storage on the client.
     */
    static async getDecryptedToken(encryptedToken: string, accountId: string): Promise<string | null> {
        if (!encryptedToken) {
            ErrorLogger.debug('No encrypted token provided for decryption');
            return null;
        }

        try {
            const result = await ErrorHandler.safeAsync(
                async () => {
                    const { data, error } = await supabase.functions.invoke('decrypt-github-token', {
                        body: { encryptedToken }
                    });

                    if (error) {
                        throw new AuthenticationError(`Token decryption failed: ${error.message}`, {
                            operation: 'decryptToken',
                            accountId
                        });
                    }

                    if (!data?.token) {
                        throw new AuthenticationError('No token received from decryption service', {
                            operation: 'decryptToken',
                            accountId
                        });
                    }

                    return data.token;
                },
                null,
                { accountId, operation: 'getDecryptedToken' }
            );

            if (result.success) {
                ErrorLogger.debug('GitHub token decrypted successfully');
                return result.data;
            } else if (result.success === false) {
                // The underlying error is already logged by safeAsync if we passed the logger logic,
                // but ErrorLogger logic inside safeAsync might just return structure.
                ErrorLogger.error('Failed to decrypt GitHub token', result.error);
                return null;
            }
            return null;
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error getting GitHub token');
            ErrorLogger.error('Unexpected error in TokenService', error, { accountId });
            return null;
        }
    }
}
