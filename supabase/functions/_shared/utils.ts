// Shared utilities for Supabase Edge Functions
// @ts-ignore - Deno import
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export async function getAuthUserIdFromRequest(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  // Extract the JWT token
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    throw new Error('Invalid Authorization header format');
  }

  // Decode the JWT to get user ID (simple decode, not full verification)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;

    if (!userId) {
      throw new Error('Invalid token: missing user ID');
    }

    return userId;
  } catch (error) {
    throw new Error('Invalid JWT token');
  }
}

export function createJsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

// Input validation utilities
export class ValidationError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'ValidationError';
  }
}

// GitHub URL validation (allows optional trailing slash)
export function validateGitHubUrl(url: string): boolean {
  // Must be a valid GitHub.com URL - allows optional trailing slash
  const githubUrlPattern = /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}\/[a-zA-Z0-9._-]+\/?$/;
  return githubUrlPattern.test(url);
}

// GitHub owner/repo validation
export function validateGitHubOwner(owner: string): boolean {
  // GitHub username/org rules: alphanumeric, hyphens, underscores, max 39 chars
  const ownerPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  return ownerPattern.test(owner) && owner.length > 0 && owner.length <= 39;
}

export function validateGitHubRepo(repo: string): boolean {
  // GitHub repo name rules: alphanumeric, hyphens, underscores, periods, max 100 chars
  const repoPattern = /^[a-zA-Z0-9._-]+$/;
  return repoPattern.test(repo) && repo.length > 0 && repo.length <= 100;
}

// File path validation (prevent path traversal)
export function validateFilePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  // Check for path traversal attempts
  if (filePath.includes('../') || filePath.includes('..\\') ||
      filePath.startsWith('/') || filePath.startsWith('\\') ||
      filePath.includes('\0')) { // null bytes
    return false;
  }

  // Must be a reasonable file path length
  if (filePath.length > 1000) return false;

  // Should not contain suspicious characters
  const suspiciousChars = /[<>:"|?*\x00-\x1f]/;
  if (suspiciousChars.test(filePath)) return false;

  return true;
}

// Branch name validation
export function validateGitHubBranch(branch: string): boolean {
  if (!branch || typeof branch !== 'string') return false;
  if (branch.length === 0 || branch.length > 255) return false;

  // GitHub branch rules - allow most characters but prevent injection
  const branchPattern = /^[^<>:"|?*\x00-\x1f]+$/;
  return branchPattern.test(branch);
}

// Email validation
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;

  // RFC 5322 compliant email regex (simplified but robust)
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailPattern.test(email) && email.length <= 254;
}

// Tier validation for audit functions
export function validateAuditTier(tier: string): boolean {
  const validTiers = ['shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'];
  return validTiers.includes(tier);
}

// Action validation
export function validateAction(action: string, allowedActions: string[]): boolean {
  return allowedActions.includes(action);
}

// Sanitize string input (remove potentially dangerous characters)
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') return '';

  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1f\x7f]/g, '');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized.trim();
}

// Validate request body is valid JSON and not too large
export async function validateRequestBody(req: Request, maxSizeBytes: number = 1024 * 1024): Promise<any> {
  try {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      throw new ValidationError('Request body too large', 413);
    }

    const body = await req.json();

    // Basic structure validation
    if (typeof body !== 'object' || body === null) {
      throw new ValidationError('Invalid JSON structure');
    }

    return body;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Invalid JSON in request body');
  }
}

// ============================================================================
// SHARED AUTHENTICATION UTILITIES
// ============================================================================

// Environment configuration
export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
}

// Validate environment variables
export function validateSupabaseEnv(env: Partial<SupabaseEnv>, requiredKeys: (keyof SupabaseEnv)[] = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']): SupabaseEnv {
  const missingKeys = requiredKeys.filter(key => !env[key]);
  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
  }

  return env as SupabaseEnv;
}

// Create authenticated Supabase client
export function createSupabaseClient(env: SupabaseEnv, options?: { auth?: { persistSession: boolean } }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
}

// Extract and validate JWT token from request
export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  // Extract the JWT token
  const token = authHeader.replace('Bearer ', '');
  if (!token || token === authHeader) return null; // No Bearer prefix found

  return token;
}

// Get authenticated user ID from request
export async function getAuthenticatedUserId(req: Request, supabase: SupabaseClient): Promise<string> {
  const token = extractAuthToken(req);
  if (!token) {
    throw new ValidationError('Missing Authorization header', 401);
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new ValidationError('Invalid or expired token', 401);
    }

    return user.id;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Authentication failed', 401);
  }
}

// Optional authentication - returns user ID if authenticated, null if not
export async function getOptionalUserId(req: Request, supabase: SupabaseClient): Promise<string | null> {
  try {
    return await getAuthenticatedUserId(req, supabase);
  } catch {
    return null;
  }
}

// ============================================================================
// SHARED RESPONSE UTILITIES
// ============================================================================

// Standardized error response
export function createErrorResponse(error: any, status: number = 500): Response {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

// Standardized success response
export function createSuccessResponse(data: any, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

// Handle CORS preflight
export function handleCorsPreflight(): Response {
  return new Response(null, { headers: corsHeaders });
}




