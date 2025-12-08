// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import {
  handleStatsAction,
  handleFingerprintAction,
  handleContentAction,
  handleTreeAction
} from './actionHandlers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { owner, repo, branch, filePath, action } = await req.json();

    if (!owner || !repo) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: owner and repo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Authenticate
    const authenticator = GitHubAuthenticator.getInstance();
    const token = await authenticator.getAuthenticatedToken(req, owner);

    // Log authentication status
    if (token) {
      console.log('🔑 [github-proxy] Using authenticated request with user token');
    } else {
      console.log('🌐 [github-proxy] Making unauthenticated request (public repo access)');
    }

    // 2. Initialize Client
    const client = new GitHubAPIClient(token);

    // 3. Route Action
    switch (action) {
      case 'stats':
        return await handleStatsAction(client, owner, repo);
      case 'fingerprint':
        return await handleFingerprintAction(client, owner, repo, branch);
      default:
        // Handle file content fetch if filePath is present, otherwise tree fetch
        if (filePath) {
          return await handleContentAction(client, owner, repo, filePath, branch);
        } else {
          return await handleTreeAction(client, owner, repo, branch);
        }
    }

  } catch (error) {
    console.error('GitHub proxy main loop error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
