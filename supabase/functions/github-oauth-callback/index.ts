// GitHub OAuth Callback Handler
// Handles OAuth flow with proper encryption and CSRF validation

import { validateSupabaseEnv, createSupabaseClient, handleCorsPreflight, createErrorResponse, createSuccessResponse } from '../_shared/utils.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as Record<string, string>;

// Environment configuration
const ENV = {
  ...validateSupabaseEnv({
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }),
  TOKEN_ENCRYPTION_KEY: Deno.env.get('TOKEN_ENCRYPTION_KEY')!,
  GITHUB_CLIENT_ID: Deno.env.get('GITHUB_CLIENT_ID')!,
  GITHUB_CLIENT_SECRET: Deno.env.get('GITHUB_CLIENT_SECRET')!,
  GITHUB_OAUTH_CALLBACK_URL: Deno.env.get('GITHUB_OAUTH_CALLBACK_URL')!,
  FRONTEND_URL: Deno.env.get('FRONTEND_URL')!,
};

// Validate additional required env vars
if (!ENV.FRONTEND_URL) {
  throw new Error('Missing FRONTEND_URL environment variable - required for OAuth redirects');
}
if (!ENV.GITHUB_CLIENT_ID || !ENV.GITHUB_CLIENT_SECRET) {
  throw new Error('Missing GitHub OAuth credentials (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)');
}
if (!ENV.GITHUB_OAUTH_CALLBACK_URL) {
  throw new Error('Missing GITHUB_OAUTH_CALLBACK_URL environment variable');
}
if (!ENV.TOKEN_ENCRYPTION_KEY) {
  throw new Error('Missing TOKEN_ENCRYPTION_KEY environment variable');
}

// Crypto-based encryption using Web Crypto API
async function encryptToken(token: string, secret: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);

    // Generate key from secret using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));

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
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // Return as base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt token');
  }
}

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

// Clean up expired CSRF states from database (called periodically)
async function cleanupExpiredStates() {
  try {
    const supabase = createSupabaseClient(ENV);
    await supabase
      .from('oauth_csrf_states')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch (error) {
    console.error('Failed to cleanup expired CSRF states:', error);
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Helper function to create popup-compatible response
  const createPopupResponse = (success: boolean, message: string) => {
    const action = success ? 'github-oauth-success' : 'github-oauth-error';
    const frontendOrigin = ENV.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash

    // Use localStorage as a reliable cross-origin communication mechanism
    // The popup sets localStorage, then the parent window detects it via storage event
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>${success ? 'GitHub Connected' : 'Connection Error'}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
    .container { text-align: center; padding: 2rem; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #64748b; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>${success ? 'Connected! Closing...' : 'Error occurred. Closing...'}</p>
  </div>
  <script>
    (function() {
      const result = {
        type: '${action}',
        success: ${success},
        message: ${JSON.stringify(message)},
        timestamp: Date.now()
      };
      
      // Method 1: Try postMessage to opener (works if same-origin or opener exists)
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(result, '${frontendOrigin}');
          console.log('[OAuth Popup] postMessage sent to opener');
        } catch (e) {
          console.log('[OAuth Popup] postMessage failed:', e);
        }
      }
      
      // Method 2: Use localStorage as fallback (works cross-origin within same browser)
      try {
        localStorage.setItem('github_oauth_result', JSON.stringify(result));
        console.log('[OAuth Popup] Result stored in localStorage');
      } catch (e) {
        console.log('[OAuth Popup] localStorage failed:', e);
      }
      
      // Close popup after brief delay
      setTimeout(function() {
        window.close();
      }, 500);
      
      // Fallback: If window doesn't close after 2s, redirect
      setTimeout(function() {
        if (!window.closed) {
          window.location.href = '${frontendOrigin}/?github=${success ? 'connected' : 'error'}';
        }
      }, 2000);
    })();
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/html' },
      }
    );
  };

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth error
    if (error) {
      console.error('GitHub OAuth error:', error);
      return createPopupResponse(false, error);
    }

    if (!code) {
      return createPopupResponse(false, 'Missing authorization code');
    }

    // Validate state (CSRF protection)
    if (!state) {
      console.error('[github-oauth-callback] Missing state parameter');
      return createPopupResponse(false, 'Invalid request - missing state');
    }

    // Parse state format: "user_id:${userId}:${timestamp}:${randomToken}"
    let userId: string | null = null;
    // Initialize Supabase client (moved from global scope for better cold-start performance)
    const supabase = createSupabaseClient(ENV);

    let timestamp: number | null = null;

    try {
      const parts = state.split(':');
      if (parts.length >= 4 && parts[0] === 'user_id') {
        userId = parts[1] || null;
        timestamp = parts[2] ? parseInt(parts[2], 10) : null;

        // Verify state exists in database and hasn't expired
        const { data: storedState, error: stateError } = await supabase
          .from('oauth_csrf_states')
          .select('*')
          .eq('state_token', state)
          .eq('user_id', userId)
          .single();

        if (stateError || !storedState) {
          console.error('[github-oauth-callback] Invalid CSRF state - not found in database');
          return createPopupResponse(false, 'Invalid request - CSRF validation failed');
        }

        // Check if state has expired
        if (new Date(storedState.expires_at) < new Date()) {
          console.error('[github-oauth-callback] CSRF state has expired');
          // Clean up expired state
          await supabase.from('oauth_csrf_states').delete().eq('state_token', state);
          return createPopupResponse(false, 'Request expired - please try again');
        }

        // State is valid, delete it (one-time use)
        await supabase.from('oauth_csrf_states').delete().eq('state_token', state);

      } else {
        console.error('[github-oauth-callback] Invalid state format:', state);
        return createPopupResponse(false, 'Invalid state format');
      }
    } catch (e) {
      console.error('[github-oauth-callback] Failed to validate state:', e);
      return createPopupResponse(false, 'Invalid state parameter');
    }

    if (!userId) {
      console.error('[github-oauth-callback] No user_id in state');
      return createPopupResponse(false, 'Invalid state - missing user ID');
    }

    // Cleanup expired states in background
    cleanupExpiredStates().catch(console.error);

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: ENV.GITHUB_CLIENT_ID,
        client_secret: ENV.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: ENV.GITHUB_OAUTH_CALLBACK_URL,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('GitHub token exchange failed:', errorText);
      return createPopupResponse(false, 'Failed to exchange token');
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData.error_description || tokenData.error);
      return createPopupResponse(false, tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return createPopupResponse(false, 'No access token received');
    }

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'SCAI'
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('GitHub user fetch failed:', errorText);
      return createPopupResponse(false, 'Failed to fetch GitHub user');
    }

    const githubUser = await userResponse.json();

    // userId was already extracted and validated during CSRF check above
    // Verify user exists in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('User not found:', profileError);
      return createPopupResponse(false, 'User not found');
    }

    // Store/update GitHub account connection with proper encryption
    const encryptedToken = await encryptToken(accessToken, ENV.TOKEN_ENCRYPTION_KEY);

    const { error: upsertError } = await supabase.from('github_accounts').upsert(
      {
        user_id: userId,
        github_user_id: githubUser.id,
        login: githubUser.login,
        avatar_url: githubUser.avatar_url || null,
        html_url: githubUser.html_url || null,
        access_token_encrypted: encryptedToken,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

    if (upsertError) {
      console.error('Failed to store GitHub account:', upsertError);
      return createPopupResponse(false, 'Failed to store GitHub connection');
    }

    // Success! Return popup-compatible response
    return createPopupResponse(true, 'GitHub account connected successfully');
  } catch (error) {
    console.error('OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return createPopupResponse(false, errorMessage);
  }
});