// ============================================================================
// GitHub App Client
// ============================================================================
// Rate-limit aware API client for GitHub App installations
// Replaces/extends GitHubAPIClient with installation token management

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LoggerService } from '../services/LoggerService.ts';

export class GitHubAppClient {
  private installationId: number;
  private supabase: SupabaseClient;
  private baseUrl = 'https://api.github.com';
  private encryptionKey: string;

  constructor(installationId: number) {
    this.installationId = installationId;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    this.encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')!;
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // ============================================================================
  // Token Management
  // ============================================================================

  private async getToken(): Promise<string> {
    const { data: installation, error } = await this.supabase
      .from('github_app_installations')
      .select('access_token_encrypted, token_expires_at')
      .eq('installation_id', this.installationId)
      .single();

    if (error) {
      throw new Error(`Installation not found: ${this.installationId}`);
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const expiresAt = new Date(installation.token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      LoggerService.info('Token expired or expiring soon, refreshing', {
        component: 'GitHubAppClient',
        installationId: this.installationId,
        expiresAt: installation.token_expires_at
      });

      // Refresh the token
      const newToken = await this.refreshInstallationToken();
      return newToken;
    }

    // Decrypt and return existing token
    return await this.decryptToken(installation.access_token_encrypted);
  }

  private async refreshInstallationToken(): Promise<string> {
    const GITHUB_APP_ID = Deno.env.get('GITHUB_APP_ID')!;
    const GITHUB_APP_PRIVATE_KEY = Deno.env.get('GITHUB_APP_PRIVATE_KEY')!;

    // Generate JWT for app authentication
    const jwt = await this.generateAppJWT(GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY);

    // Get new installation token
    const response = await fetch(
      `https://api.github.com/app/installations/${this.installationId}/access_tokens`,
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
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const newToken = data.token;
    const expiresAt = data.expires_at;

    // Encrypt and store the new token
    const encryptedToken = await this.encryptToken(newToken);

    const { error } = await this.supabase
      .from('github_app_installations')
      .update({
        access_token_encrypted: encryptedToken,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('installation_id', this.installationId);

    if (error) {
      LoggerService.error('Failed to update token in database', error, {
        component: 'GitHubAppClient',
        installationId: this.installationId
      });
      throw error;
    }

    LoggerService.info('Successfully refreshed installation token', {
      component: 'GitHubAppClient',
      installationId: this.installationId,
      expiresAt
    });

    return newToken;
  }

  // ============================================================================
  // Rate Limit Management
  // ============================================================================

  private async checkRateLimits(): Promise<{
    remaining: number;
    limit: number;
    resetAt: Date;
  }> {
    const { data: limits, error } = await this.supabase
      .from('github_rate_limits')
      .select('*')
      .eq('installation_id', this.installationId)
      .eq('resource', 'core')
      .single();

    if (error || !limits) {
      // No rate limit data yet, assume default limits
      return {
        remaining: 5000,
        limit: 5000,
        resetAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      };
    }

    const resetAt = new Date(limits.reset_at);
    const now = new Date();

    // If reset time has passed, limits have been refreshed
    if (resetAt < now) {
      return {
        remaining: limits.limit_total,
        limit: limits.limit_total,
        resetAt: new Date(now.getTime() + 60 * 60 * 1000)
      };
    }

    return {
      remaining: limits.remaining,
      limit: limits.limit_total,
      resetAt
    };
  }

  private async updateRateLimits(headers: Headers): Promise<void> {
    const limit = parseInt(headers.get('X-RateLimit-Limit') || '5000');
    const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '5000');
    const reset = parseInt(headers.get('X-RateLimit-Reset') || '0') * 1000; // Convert to milliseconds

    const { error } = await this.supabase
      .from('github_rate_limits')
      .upsert({
        installation_id: this.installationId,
        resource: 'core',
        limit_total: limit,
        remaining: remaining,
        reset_at: new Date(reset).toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'installation_id,resource'
      });

    if (error) {
      LoggerService.warn('Failed to update rate limits', {
        component: 'GitHubAppClient',
        installationId: this.installationId,
        error: error.message
      });
    }
  }

  // ============================================================================
  // Request Methods
  // ============================================================================

  async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    return await this.fetchWithRetry(endpoint, options);
  }

  async get(endpoint: string): Promise<any> {
    const response = await this.request(endpoint);
    return response.json();
  }

  async post(endpoint: string, body: any): Promise<any> {
    const response = await this.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async put(endpoint: string, body: any): Promise<any> {
    const response = await this.request(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  // ============================================================================
  // Core Request Logic with Rate Limiting and Retry
  // ============================================================================

  private async fetchWithRetry(
    endpoint: string,
    options: RequestInit = {},
    attempt = 1
  ): Promise<Response> {
    const MAX_RETRIES = 3;

    // Get valid token
    const token = await this.getToken();

    // Check rate limits before making request
    const limits = await this.checkRateLimits();

    // If we're getting low on requests, add delay
    if (limits.remaining < 100) {
      const resetTime = limits.resetAt.getTime() - Date.now();
      if (resetTime > 0 && resetTime < 60000) { // Less than 1 minute
        LoggerService.warn(`Rate limit low (${limits.remaining}), waiting ${Math.ceil(resetTime / 1000)}s`, {
          component: 'GitHubAppClient',
          installationId: this.installationId
        });
        await new Promise(resolve => setTimeout(resolve, resetTime + 1000));
      }
    }

    // Make the request
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'RepoAuditAI',
        ...options.headers
      }
    });

    // Update rate limits from response headers
    await this.updateRateLimits(response.headers);

    // Handle rate limiting (429) and server errors (5xx)
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(`GitHub API failed after ${MAX_RETRIES} attempts: ${response.status}`);
      }

      // Calculate retry delay
      let delay: number;
      if (response.status === 429) {
        // Use Retry-After header if provided
        const retryAfter = response.headers.get('Retry-After');
        delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
      } else {
        // Exponential backoff for server errors
        delay = Math.pow(2, attempt) * 1000;
      }

      LoggerService.warn(`GitHub ${response.status}, retry ${attempt}/${MAX_RETRIES} in ${delay}ms`, {
        component: 'GitHubAppClient',
        installationId: this.installationId,
        endpoint
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.fetchWithRetry(endpoint, options, attempt + 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
  }

  // ============================================================================
  // Convenience Methods (matching GitHubAPIClient interface)
  // ============================================================================

  async fetchRepo(owner: string, repo: string) {
    return this.get(`/repos/${owner}/${repo}`);
  }

  async fetchLanguages(owner: string, repo: string) {
    return this.get(`/repos/${owner}/${repo}/languages`);
  }

  async fetchTree(owner: string, repo: string, branch: string) {
    return this.get(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  }

  async fetchFile(owner: string, repo: string, path: string, branch: string) {
    return this.get(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  }

  async fetchUser(owner: string) {
    return this.get(`/users/${owner}`);
  }

  async fetchOrg(owner: string) {
    return this.get(`/orgs/${owner}`);
  }

  async getRef(owner: string, repo: string, ref: string) {
    return this.get(`/repos/${owner}/${repo}/git/${ref}`);
  }

  async createRef(owner: string, repo: string, ref: string, sha: string) {
    return this.post(`/repos/${owner}/${repo}/git/refs`, { ref, sha });
  }

  async getFileContent(owner: string, repo: string, path: string, branch: string) {
    return this.get(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  }

  async createOrUpdateFile(owner: string, repo: string, path: string, message: string, content: string, branch: string, sha?: string) {
    const body: any = { message, content, branch };
    if (sha) body.sha = sha;
    return this.put(`/repos/${owner}/${repo}/contents/${path}`, body);
  }

  async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string) {
    return this.post(`/repos/${owner}/${repo}/pulls`, { title, body, head, base });
  }

  // ============================================================================
  // JWT Generation Utility
  // ============================================================================

  private async generateAppJWT(appId: string, privateKeyPem: string): Promise<string> {
    const privateKey = atob(privateKeyPem);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iat: now - 60, // Issued at (60 seconds ago for clock drift)
      exp: now + (10 * 60), // Expires in 10 minutes
      iss: appId
    };

    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(privateKey),
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

  private pemToArrayBuffer(pem: string): ArrayBuffer {
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
  // Encryption Utilities (Basic implementation - use proper encryption in production)
  // ============================================================================

  private async encryptToken(token: string): Promise<string> {
    const encoder = new TextEncoder();

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Generate key from secret using PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.encryptionKey),
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
      ['encrypt']
    );

    // Encrypt the token
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoder.encode(token)
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // Return base64 encoded result
    return btoa(String.fromCharCode(...combined));
  }

  private async decryptToken(encryptedData: string): Promise<string> {
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
      encoder.encode(this.encryptionKey),
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
  }
}