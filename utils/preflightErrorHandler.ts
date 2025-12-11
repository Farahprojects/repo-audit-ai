/**
 * Maps preflight service errors to user-friendly messages
 * Handles both structured errors and string-based error messages
 */
export function getPreflightErrorMessage(error: unknown): string {
  // If it's not an Error, return a generic message
  if (!(error instanceof Error)) {
    return 'An unexpected error occurred';
  }

  const message = error.message.toLowerCase();

  // Handle structured errors with prefixes (e.g., "PRIVATE_REPO:...")
  if (message.includes('private_repo:')) {
    // This is handled specially in PreflightModal - it triggers GitHub connect flow
    // Return the original message so the modal can detect it
    return error.message;
  }

  if (message.includes('repository owner does not exist')) {
    return 'Repository owner does not exist. Please check the URL.';
  }

  if (message.includes('repository not found') ||
      message.includes('not found')) {
    return 'Repository not found. Please check the URL.';
  }

  if (message.includes('access denied') ||
      message.includes('forbidden')) {
    return 'Access denied. This repository may be private.';
  }

  if (message.includes('rate limit') ||
      message.includes('too many requests')) {
    return 'Rate limit exceeded. Please wait and try again.';
  }

  if (message.includes('network') ||
      message.includes('connection')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Return the original message if no specific mapping found
  return error.message || 'Failed to analyze repository';
}

/**
 * Checks if the error indicates a private repository that requires GitHub auth
 */
export function isPrivateRepoError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes('private_repo:');
}
