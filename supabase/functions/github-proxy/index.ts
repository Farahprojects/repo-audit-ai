import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GitHubAuthenticator } from '../_shared/github/GitHubAuthenticator.ts';
import { GitHubAPIClient } from '../_shared/github/GitHubAPIClient.ts';
import { GitHubAppClient } from '../_shared/github/GitHubAppClient.ts';
import {
  validateRequestBody,
  validateGitHubOwner,
  validateGitHubRepo,
  validateFilePath,
  validateGitHubBranch,
  validateAction
} from '../_shared/utils.ts';
import {
  handleStatsAction,
  handleFingerprintAction,
  handlePreflightAction,
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
    // Validate request body
    const requestData = await validateRequestBody(req);
    const { owner, repo, branch, filePath, action, installationId } = requestData;

    // Validate required parameters
    if (!owner || !repo) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: owner and repo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate GitHub owner format
    if (!validateGitHubOwner(owner)) {
      return new Response(
        JSON.stringify({ error: 'Invalid owner format. Must be a valid GitHub username or organization name.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate GitHub repo format
    if (!validateGitHubRepo(repo)) {
      return new Response(
        JSON.stringify({ error: 'Invalid repo format. Must be a valid GitHub repository name.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate branch if provided
    if (branch && !validateGitHubBranch(branch)) {
      return new Response(
        JSON.stringify({ error: 'Invalid branch format.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate filePath if provided (prevent path traversal)
    if (filePath && !validateFilePath(filePath)) {
      return new Response(
        JSON.stringify({ error: 'Invalid file path. Path traversal attempts are not allowed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate action parameter
    const validActions = ['preflight', 'stats', 'fingerprint', 'content', 'tree'];
    if (action && !validateAction(action, validActions)) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Initialize Client (dual-mode: GitHub App or OAuth)
    let client: GitHubAPIClient | GitHubAppClient;

    if (installationId) {
      // Use GitHub App client
      client = new GitHubAppClient(installationId);
      console.log(`Using GitHub App client for installation ${installationId}`);
    } else {
      // Use OAuth token from Authorization header (SECURITY: Never from request body)
      const authenticator = GitHubAuthenticator.getInstance();
      const token = await authenticator.getAuthenticatedToken(req.headers.get('authorization'), owner);

      // Log authentication status
      if (token) {
        console.log('Using OAuth token from Authorization header');
      } else {
        console.log('No authentication token available - public repo access only');
      }

      client = new GitHubAPIClient(token);
    }

    // 3. Route Action
    switch (action) {
      case 'preflight':
        return await handlePreflightAction(client, owner, repo, branch);
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
