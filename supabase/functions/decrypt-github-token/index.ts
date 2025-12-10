// Decrypt GitHub Token - Server-side decryption for secure token access

import { validateRequestBody, ValidationError, validateSupabaseEnv, createSupabaseClient, handleCorsPreflight, createErrorResponse, createSuccessResponse, getAuthenticatedUserId } from '../_shared/utils.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment configuration
const ENV = validateSupabaseEnv({
  SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
});

const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');
if (!TOKEN_ENCRYPTION_KEY) {
  throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
}

const supabase = createSupabaseClient(ENV);

// Crypto-based decryption
async function decryptToken(encryptedData: string, secret: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Generate key from secret
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
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt token');
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('Missing authorization header', 401);
    }

    // Get authenticated user ID
    let userId: string;
    try {
      userId = await getAuthenticatedUserId(req, supabase);
    } catch (e) {
      console.error('[decrypt-github-token] Authentication failed:', e);
      return createErrorResponse('Invalid token format', 401);
    }

    // Validate request body
    const body = await validateRequestBody(req, 10 * 1024); // 10KB limit
    const { encryptedToken } = body;

    // Validate encryptedToken parameter
    if (!encryptedToken || typeof encryptedToken !== 'string') {
      return createErrorResponse('Missing or invalid encryptedToken parameter', 400);
    }

    // Validate encryptedToken format (should be base64-like)
    if (encryptedToken.length === 0 || encryptedToken.length > 10000) {
      return createErrorResponse('Invalid encryptedToken length', 400);
    }

    // Basic format validation (should contain only base64 characters)
    if (!/^[A-Za-z0-9+/=]+$/.test(encryptedToken)) {
      return createErrorResponse('Invalid encryptedToken format', 400);
    }

    // Verify user owns this GitHub account
    const { data: githubAccount, error: accountError } = await supabase
      .from('github_accounts')
      .select('access_token_encrypted')
      .eq('user_id', userId)
      .single();

    if (accountError || !githubAccount) {
      return createErrorResponse('GitHub account not found', 404);
    }

    // Verify the encrypted token matches what we have stored
    if (githubAccount.access_token_encrypted !== encryptedToken) {
      return createErrorResponse('Invalid token', 403);
    }

    // Decrypt the token
    const decryptedToken = await decryptToken(encryptedToken, TOKEN_ENCRYPTION_KEY);

    return createSuccessResponse({
      token: decryptedToken,
    });
  } catch (error) {
    console.error('Error in decrypt-github-token:', error);
    return createErrorResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});