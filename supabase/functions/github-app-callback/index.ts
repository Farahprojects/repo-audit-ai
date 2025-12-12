// ============================================================================
// GitHub App Callback Handler
// ============================================================================
// Handles GitHub App installation webhooks and manages installation tokens
// This function receives webhooks from GitHub when users install/uninstall the app

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GITHUB_APP_ID = Deno.env.get('GITHUB_APP_ID')!;
const GITHUB_APP_PRIVATE_KEY = Deno.env.get('GITHUB_APP_PRIVATE_KEY')!;

interface GitHubWebhookPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: {
    id: number;
    account: {
      id: number;
      login: string;
      type: 'User' | 'Organization';
    };
    permissions: Record<string, string>;
    repository_selection: 'all' | 'selected';
  };
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
  }>;
}

// ============================================================================
// JWT Generation for GitHub App Authentication
// ============================================================================

async function generateAppJWT(): Promise<string> {
  const privateKey = atob(GITHUB_APP_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now - 60, // Issued at (60 seconds ago for clock drift)
    exp: now + (10 * 60), // Expires in 10 minutes
    iss: GITHUB_APP_ID // GitHub App ID
  };

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Base64 encode header and payload
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Create signing input
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

// Convert PEM to ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================================
// Installation Token Management
// ============================================================================

async function getInstallationToken(installationId: number): Promise<{
  token: string;
  expires_at: string;
}> {
  const jwt = await generateAppJWT();

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'RepoAuditAI'
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installation token: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    expires_at: data.expires_at
  };
}

// ============================================================================
// Encryption/Decryption Utilities
// ============================================================================

async function encryptToken(token: string): Promise<string> {
  // Use a simple encryption for now - in production, use proper encryption
  // For this demo, we'll use base64 encoding (not secure for production!)
  return btoa(token);
}

async function decryptToken(encryptedToken: string): Promise<string> {
  // For this demo, base64 decoding (not secure for production!)
  return atob(encryptedToken);
}

// ============================================================================
// Webhook Handlers
// ============================================================================

async function handleInstallationCreated(
  supabase: any,
  payload: GitHubWebhookPayload
): Promise<void> {
  const { installation } = payload;
  console.log(`Processing installation created for ${installation.account.login}`);

  try {
    // Get installation access token
    const { token, expires_at } = await getInstallationToken(installation.id);

    // Encrypt the token
    const encryptedToken = await encryptToken(token);

    // Store installation in database
    const { error } = await supabase
      .from('github_app_installations')
      .upsert({
        installation_id: installation.id,
        account_type: installation.account.type,
        account_login: installation.account.login,
        account_id: installation.account.id,
        access_token_encrypted: encryptedToken,
        token_expires_at: expires_at,
        permissions: installation.permissions,
        repository_selection: installation.repository_selection,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'installation_id'
      });

    if (error) {
      console.error('Failed to store installation:', error);
      throw error;
    }

    console.log(`Successfully stored installation for ${installation.account.login}`);

  } catch (error) {
    console.error('Failed to handle installation created:', error);
    throw error;
  }
}

async function handleInstallationDeleted(
  supabase: any,
  payload: GitHubWebhookPayload
): Promise<void> {
  const { installation } = payload;
  console.log(`Processing installation deleted for ${installation.account.login}`);

  // Remove installation from database
  const { error } = await supabase
    .from('github_app_installations')
    .delete()
    .eq('installation_id', installation.id);

  if (error) {
    console.error('Failed to delete installation:', error);
    throw error;
  }

  // Also clean up related data
  await supabase
    .from('github_rate_limits')
    .delete()
    .eq('installation_id', installation.id);

  console.log(`Successfully deleted installation for ${installation.account.login}`);
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify webhook signature (important for security!)
    // GitHub sends X-Hub-Signature-256 header
    const signature = req.headers.get('X-Hub-Signature-256');
    if (!signature) {
      console.warn('No webhook signature provided');
      // For now, continue (add proper signature verification in production)
    }

    // Parse webhook payload
    const payload: GitHubWebhookPayload = await req.json();
    const eventType = req.headers.get('X-GitHub-Event');

    console.log(`Received GitHub webhook: ${eventType} - ${payload.action}`);

    // Handle different webhook events
    switch (eventType) {
      case 'installation':
        switch (payload.action) {
          case 'created':
            await handleInstallationCreated(supabase, payload);
            break;
          case 'deleted':
            await handleInstallationDeleted(supabase, payload);
            break;
          case 'suspend':
          case 'unsuspend':
            // Handle suspend/unsuspend if needed
            console.log(`Installation ${payload.action} for ${payload.installation.account.login}`);
            break;
          default:
            console.log(`Unhandled installation action: ${payload.action}`);
        }
        break;

      case 'installation_repositories':
        // Handle repository selection changes
        console.log(`Repository selection changed for installation ${payload.installation.id}`);
        break;

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});