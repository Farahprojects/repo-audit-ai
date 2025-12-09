// @ts-nocheck - Deno runtime
// GitHub OAuth Start - Secure Server-Side OAuth Initiation
// Returns OAuth URL with CSRF-protected state token

import { validateSupabaseEnv, createSupabaseClient, handleCorsPreflight, createErrorResponse, createSuccessResponse, getAuthenticatedUserId } from '../_shared/utils.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Environment configuration
const ENV = {
  ...validateSupabaseEnv({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }),
  GITHUB_CLIENT_ID: Deno.env.get('GITHUB_CLIENT_ID')!,
  GITHUB_OAUTH_CALLBACK_URL: Deno.env.get('GITHUB_OAUTH_CALLBACK_URL')!,
};

// Log all env vars on startup for debugging
console.log('[github-oauth-start] ENV check:', {
  SUPABASE_URL: ENV.SUPABASE_URL ? 'SET' : 'MISSING',
  GITHUB_CLIENT_ID: ENV.GITHUB_CLIENT_ID ? 'SET' : 'MISSING',
  GITHUB_OAUTH_CALLBACK_URL: ENV.GITHUB_OAUTH_CALLBACK_URL || 'MISSING',
});

// Validate additional required env vars
if (!ENV.GITHUB_CLIENT_ID) {
  throw new Error('Missing GITHUB_CLIENT_ID environment variable');
}
if (!ENV.GITHUB_OAUTH_CALLBACK_URL) {
  throw new Error('Missing GITHUB_OAUTH_CALLBACK_URL environment variable - this must be set to your callback URL (e.g., http://localhost:8080)');
}

const supabase = createSupabaseClient(ENV);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Get authenticated user ID
    let userId: string;
    try {
      userId = await getAuthenticatedUserId(req, supabase);
    } catch (e) {
      console.error('[github-oauth-start] Authentication failed:', e);
      return new Response(JSON.stringify({ error: 'Invalid token format' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    console.log('[github-oauth-start] User ID extracted from token:', userId);

    // Generate secure CSRF state with timestamp
    const timestamp = Date.now();
    const randomToken = crypto.randomUUID();
    const state = `user_id:${userId}:${timestamp}:${randomToken}`;

    // Store CSRF state in database with expiry (10 minutes)
    const expiresAt = new Date(timestamp + 10 * 60 * 1000).toISOString();

    // Clean up old states first (older than 10 minutes)
    await supabase
      .from('oauth_csrf_states')
      .delete()
      .lt('expires_at', new Date().toISOString());

    // Store new state
    const { error: storeError } = await supabase
      .from('oauth_csrf_states')
      .insert({
        state_token: state,
        user_id: userId,
        expires_at: expiresAt,
      });

    if (storeError) {
      console.error('[github-oauth-start] Failed to store CSRF state:', storeError);
      return new Response(JSON.stringify({ error: 'Failed to generate OAuth state' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Construct OAuth URL server-side
    const scope = 'read:user repo';
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', ENV.GITHUB_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', ENV.GITHUB_OAUTH_CALLBACK_URL);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    console.log(`[github-oauth-start] Generated OAuth URL for user ${userId}`);

    // Return OAuth URL to frontend
    return new Response(
      JSON.stringify({
        url: authUrl.toString(),
        state: state,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in github-oauth-start:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
});