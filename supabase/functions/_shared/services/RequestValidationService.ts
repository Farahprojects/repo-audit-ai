// Request Validation Service - Handles all input validation logic
// Follows Single Responsibility Principle: Only validates inputs

import {
  validateGitHubUrl,
  validateFilePath,
  ValidationError,
  parseGitHubRepo
// @ts-ignore - Deno environment provides these imports
} from '../utils.ts';
// @ts-ignore - Deno environment provides these imports
import { VALID_TIERS, mapTier } from '../costEstimation.ts';

export interface AuditRequest {
  repoUrl: string;
  files?: any[];
  tier?: string;
  estimatedTokens?: number;
  githubToken?: string;
  preflightId?: string;
  preflight?: any;
}

export interface ValidatedRequest {
  repoUrl: string;
  fileMap: any[];
  tier: string;
  estimatedTokens?: number;
  githubToken?: string;
  preflightId?: string;
  preflightRecord?: any;
  repoInfo: { owner: string; repo: string; normalized: string };
}

export class RequestValidationService {
  /**
   * Validates audit orchestration request
   */
  static validateAuditOrchestrationRequest(body: any): { isValid: boolean; error?: string } {
    if (!body.preflightId || typeof body.preflightId !== 'string') {
      return { isValid: false, error: 'preflightId is required and must be a string' };
    }

    if (!body.tier || typeof body.tier !== 'string') {
      return { isValid: false, error: 'tier is required and must be a string' };
    }

    if (body.userId !== undefined && typeof body.userId !== 'string') {
      return { isValid: false, error: 'userId must be a string if provided' };
    }

    // Validate tier is one of the allowed values
    const validTiers = ['shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'];
    if (!validTiers.includes(body.tier)) {
      return { isValid: false, error: `tier must be one of: ${validTiers.join(', ')}` };
    }

    return { isValid: true };
  }

  /**
   * Validates the complete audit request
   */
  static async validateRequest(body: any): Promise<ValidatedRequest> {
    const request = this.parseRequestBody(body);
    const validated = await this.performValidation(request);

    return validated;
  }

  /**
   * Parse and structure the request body
   */
  private static parseRequestBody(body: any): AuditRequest {
    return {
      repoUrl: body.repoUrl,
      files: body.files,
      tier: body.tier || 'security',
      estimatedTokens: body.estimatedTokens,
      githubToken: body.githubToken,
      preflightId: body.preflightId,
      preflight: body.preflight
    };
  }

  /**
   * Perform all validation logic
   */
  private static async performValidation(request: AuditRequest): Promise<ValidatedRequest> {
    // Validate required parameters
    let fileMap = request.files;
    let preflightRecord = request.preflight;

    // If preflightId is provided, it will be fetched later by PreflightService
    // For now, we just validate the structure

    // Extract files from preflight if provided directly
    if (preflightRecord && (!fileMap || fileMap.length === 0)) {
      fileMap = preflightRecord.repo_map;
    }

    // Validate basic requirements
    if (!request.repoUrl) {
      throw new ValidationError('repoUrl is required');
    }

    if (!fileMap || fileMap.length === 0) {
      throw new ValidationError('files array is required (or valid preflight with repo_map)');
    }

    // Validate tier
    if (!request.tier) {
      throw new ValidationError('tier is required');
    }
    const tier = mapTier(request.tier);
    if (!tier) {
      throw new ValidationError(`Invalid audit tier: ${request.tier}. Valid tiers: ${VALID_TIERS.join(', ')}`);
    }

    // Validate files array
    this.validateFilesArray(fileMap);

    // Validate GitHub URL
    if (!validateGitHubUrl(request.repoUrl)) {
      throw new ValidationError('Invalid repository URL format. Must be a valid GitHub.com URL.');
    }

    // Parse repo info for security validation
    const repoInfo = parseGitHubRepo(request.repoUrl);
    if (!repoInfo) {
      throw new ValidationError('Could not extract owner/repo from repoUrl');
    }

    // Validate all file URLs are from the correct repository (security check)
    this.validateFileOwnership(fileMap, repoInfo);

    // Validate estimated tokens if provided
    if (request.estimatedTokens !== undefined) {
      if (typeof request.estimatedTokens !== 'number' || request.estimatedTokens < 0 || request.estimatedTokens > 10000000) {
        throw new ValidationError('Invalid estimatedTokens: must be a positive number <= 10M');
      }
    }

    // Build ValidatedRequest conditionally to handle exactOptionalPropertyTypes
    const baseRequest: ValidatedRequest = {
      repoUrl: request.repoUrl,
      fileMap,
      tier,
      repoInfo
    };

    // Add optional properties conditionally
    const validatedRequest: ValidatedRequest = {
      ...baseRequest,
      ...(request.estimatedTokens !== undefined && { estimatedTokens: request.estimatedTokens }),
      ...(request.githubToken && { githubToken: request.githubToken }),
      ...(request.preflightId && { preflightId: request.preflightId }),
      ...(preflightRecord && { preflightRecord })
    };

    return validatedRequest;
  }

  /**
   * Validate files array structure and constraints
   */
  private static validateFilesArray(files: any[]): void {
    if (!Array.isArray(files)) {
      throw new ValidationError('files must be an array');
    }

    if (files.length === 0) {
      throw new ValidationError('files array cannot be empty');
    }

    // Prevent DoS attacks
    if (files.length > 10000) {
      throw new ValidationError('Too many files (max 10,000)');
    }

    // Validate each file object
    for (let i = 0; i < files.length; i++) {
      this.validateFileObject(files[i], i);
    }
  }

  /**
   * Validate individual file object
   */
  private static validateFileObject(file: any, index: number): void {
    if (!file || typeof file !== 'object') {
      throw new ValidationError(`Invalid file at index ${index}: must be an object`);
    }

    if (!file.path || typeof file.path !== 'string') {
      throw new ValidationError(`Invalid file path at index ${index}: must be a string`);
    }

    // Validate file path (prevent path traversal)
    if (!validateFilePath(file.path)) {
      throw new ValidationError(`Invalid file path at index ${index}: path traversal not allowed`);
    }

    // Validate file size if present
    if (file.size !== undefined) {
      if (typeof file.size !== 'number' || file.size < 0 || file.size > 50 * 1024 * 1024) {
        throw new ValidationError(`Invalid file size at index ${index}: must be 0-50MB`);
      }
    }
  }

  /**
   * Validate that all file URLs belong to the declared repository (critical security check)
   */
  private static validateFileOwnership(files: any[], repoInfo: { owner: string; repo: string }): void {
    const ownerRepoPattern = new RegExp(`/${repoInfo.owner}/${repoInfo.repo}/`, 'i');

    const allowedUrlPatterns = [
      /^https:\/\/raw\.githubusercontent\.com\//,
      /^https:\/\/api\.github\.com\//,
    ];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.url) continue; // Files without URLs will use path-based fallback

      if (typeof file.url !== 'string') {
        throw new ValidationError(`File at index ${i} has invalid URL type`);
      }

      // Check domain is GitHub
      if (!allowedUrlPatterns.some(pattern => pattern.test(file.url))) {
        throw new ValidationError('Invalid file URL domain. Only GitHub URLs are allowed.');
      }

      // CRITICAL: Check URL contains the declared owner/repo
      if (!ownerRepoPattern.test(file.url)) {
        throw new ValidationError(
          `Security Error: File URL at index ${i} does not match declared repository. ` +
          `Expected: ${repoInfo.owner}/${repoInfo.repo}`
        );
      }
    }
  }
}
