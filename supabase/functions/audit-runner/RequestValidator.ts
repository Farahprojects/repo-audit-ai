import {
  validateRequestBody,
  validateGitHubUrl,
  validateFilePath,
  ValidationError,
  parseGitHubRepo,
  createErrorResponse
} from '../_shared/utils.ts';
import { VALID_TIERS, mapTier, calculateServerEstimate } from '../_shared/costEstimation.ts';

export interface ValidatedAuditRequest {
  repoUrl: string;
  fileMap: any[];
  tier: string;
  estimatedTokens?: number;
  githubToken?: string;
  preflightId?: string;
  preflightRecord?: any;
  serverEstimatedTokens: number;
  action?: 'run' | 'quote';
  paymentMethodId?: string;
  repoInfo: { owner: string; repo: string };
}

export class RequestValidator {
  static async validateRequest(req: Request): Promise<ValidatedAuditRequest> {
    // Validate request body
    const body = await validateRequestBody(req);
    const {
      repoUrl,
      files,
      tier: rawTier = 'security',
      estimatedTokens,
      githubToken,
      preflightId,
      preflight: preflightData,
      paymentMethodId
    } = body;

    // Validate required parameters
    if (!repoUrl || (!files || files.length === 0) && !preflightId && !preflightData) {
      throw new ValidationError('Missing required parameters: repoUrl and files (or preflight)');
    }

    // Validate and map tier
    const tier = mapTier(rawTier);
    if (!tier) {
      throw new ValidationError(`Invalid audit tier: ${rawTier}. Valid tiers: ${VALID_TIERS.join(', ')}`);
    }

    // Handle preflight data
    let fileMap = files;
    let preflightRecord = preflightData;

    // Extract files from preflight if not provided directly
    if (preflightRecord && (!fileMap || fileMap.length === 0)) {
      fileMap = preflightRecord.repo_map;
    }

    // Validate files array
    if (!Array.isArray(fileMap) || fileMap.length === 0) {
      throw new ValidationError('files must be a non-empty array');
    }

    // Validate files array size (prevent DoS)
    if (fileMap.length > 10000) {
      throw new ValidationError('Too many files (max 10,000)');
    }

    // Validate GitHub URL format
    if (!validateGitHubUrl(repoUrl)) {
      throw new ValidationError('Invalid repository URL format. Must be a valid GitHub.com URL.');
    }

    // Validate file objects structure
    this.validateFileObjects(fileMap);

    // Extract and validate repository info
    const repoInfo = parseGitHubRepo(repoUrl);
    if (!repoInfo) {
      throw new ValidationError('Could not extract owner/repo from repoUrl');
    }
    const { owner: declaredOwner, repo: declaredRepo } = repoInfo;

    // Validate file URLs match declared repository
    this.validateFileUrls(fileMap, declaredOwner, declaredRepo);

    // Validate estimatedTokens if provided
    if (estimatedTokens !== undefined && (typeof estimatedTokens !== 'number' || estimatedTokens < 0 || estimatedTokens > 10000000)) {
      throw new ValidationError('Invalid estimatedTokens: must be a positive number <= 10M');
    }

    // Calculate server-side token estimate
    const serverEstimatedTokens = calculateServerEstimate(tier, fileMap);

    return {
      repoUrl,
      fileMap,
      tier,
      estimatedTokens,
      githubToken,
      preflightId,
      preflightRecord,
      serverEstimatedTokens,
      repoInfo
    };
  }

  private static validateFileObjects(fileMap: any[]): void {
    for (let i = 0; i < fileMap.length; i++) {
      const file = fileMap[i];

      if (!file || typeof file !== 'object') {
        throw new ValidationError(`Invalid file at index ${i}: must be an object`);
      }

      if (!file.path || typeof file.path !== 'string') {
        throw new ValidationError(`Invalid file path at index ${i}: must be a string`);
      }

      // Validate file path (prevent path traversal)
      if (!validateFilePath(file.path)) {
        throw new ValidationError(`Invalid file path at index ${i}: path traversal not allowed`);
      }

      // Validate file size if present
      if (file.size !== undefined && (typeof file.size !== 'number' || file.size < 0 || file.size > 50 * 1024 * 1024)) {
        throw new ValidationError(`Invalid file size at index ${i}: must be 0-50MB`);
      }
    }
  }

  private static validateFileUrls(fileMap: any[], declaredOwner: string, declaredRepo: string): void {
    // Build case-insensitive pattern to match owner/repo in file URLs
    const ownerRepoPattern = new RegExp(`/${declaredOwner}/${declaredRepo}/`, 'i');

    // Validate all file URLs are from trusted GitHub domains
    const allowedUrlPatterns = [
      /^https:\/\/raw\.githubusercontent\.com\//,
      /^https:\/\/api\.github\.com\//,
    ];

    // Check EVERY file URL matches the declared repository
    for (let i = 0; i < fileMap.length; i++) {
      const f = fileMap[i];
      if (!f.url) continue; // Files without URLs will use path-based fallback in worker

      if (typeof f.url !== 'string') {
        throw new ValidationError(`File at index ${i} has invalid URL type`);
      }

      // Check domain is GitHub
      if (!allowedUrlPatterns.some(pattern => pattern.test(f.url))) {
        console.error(`🚨 SECURITY: Invalid domain in file URL at index ${i}: ${f.url}`);
        throw new ValidationError('Invalid file URL domain. Only GitHub URLs are allowed.');
      }

      // CRITICAL: Check URL contains the declared owner/repo
      if (!ownerRepoPattern.test(f.url)) {
        console.error(`🚨 SECURITY: File URL does not match declared repo!`);
        console.error(`   Declared: ${declaredOwner}/${declaredRepo}`);
        console.error(`   File URL: ${f.url}`);
        throw new ValidationError(
          `Security Error: File URL at index ${i} does not match declared repository. ` +
          `Expected: ${declaredOwner}/${declaredRepo}, Got URL: ${f.url.substring(0, 100)}`
        );
      }
    }
  }
}
