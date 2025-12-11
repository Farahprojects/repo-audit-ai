import { AuthApiError } from '@supabase/supabase-js';

/**
 * Maps Supabase auth errors to user-friendly messages using error codes/status
 * instead of brittle string matching on error messages.
 */
export function getAuthErrorMessage(error: unknown): string {
  // If it's not an Error, return a generic message
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred';
  }

  // Check if it's a Supabase AuthApiError with status/code
  if (error instanceof AuthApiError) {
    switch (error.status) {
      case 400:
        // Bad Request - could be invalid credentials or weak password
        if (error.message?.toLowerCase().includes('invalid') ||
            error.message?.toLowerCase().includes('credentials')) {
          return 'Invalid email or password.';
        }
        if (error.message?.toLowerCase().includes('password')) {
          return 'Password must be 6+ characters.';
        }
        return 'Invalid request. Please check your input.';

      case 401:
        // Unauthorized - email not confirmed
        return 'Please verify your email first.';

      case 422:
        // Unprocessable Entity - user already exists
        return 'Email already registered.';

      case 429:
        // Too Many Requests
        return 'Too many attempts. Please wait and try again.';

      default:
        // For other 4xx/5xx errors, use the message but clean it up
        return error.message || 'Authentication failed';
    }
  }

  // For non-AuthApiError errors, check message content as fallback
  // This maintains backward compatibility but is less brittle
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials') ||
      message.includes('invalid credentials')) {
    return 'Invalid email or password.';
  }

  if (message.includes('user already registered') ||
      message.includes('already registered')) {
    return 'Email already registered.';
  }

  if (message.includes('email not confirmed') ||
      message.includes('not confirmed')) {
    return 'Please verify your email first.';
  }

  if (message.includes('password should be') ||
      message.includes('password')) {
    return 'Password must be 6+ characters.';
  }

  // Return the original message if no specific mapping found
  return error.message || 'An error occurred';
}

/**
 * Type guard to check if error is AuthApiError
 */
export function isAuthApiError(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError;
}
