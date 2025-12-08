export interface ViewState {
  landing: 'landing';
  preflight: 'preflight';
  scanning: 'scanning';
  report: 'report';
  pricing: 'pricing';
  about: 'about';
  contact: 'contact';
  dashboard: 'dashboard';
}

export interface AuditStats {
  files: number;
  tokens: string | number;
  size: string | number;
  language: string;
  languagePercent: number;
  fingerprint?: ComplexityFingerprint;
}

export interface Issue {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  codeSnippet?: string;
  tags?: string[];
  suggestedFix?: string;
}

export interface RepoReport {
  repoName: string;
  healthScore: number;
  issues: Issue[];
  summary: string;
  stats: AuditStats;
  topStrengths?: { title: string; detail: string }[];
  topIssues?: { title: string; detail: string }[];
  suspiciousFiles?: string[];
  categoryAssessments?: any;
  seniorDeveloperAssessment?: any;
  overallVerdict?: string;
  productionReady?: boolean;
  riskLevel?: 'critical' | 'high' | 'medium' | 'low';
  detectedStack?: string;
  tier?: string;
  auditId?: string;
}

export interface AuditRecord {
  id: string;
  repo_url: string;
  tier: string;
  health_score: number;
  summary: string;
  created_at: string;
  issues: Issue[];
  extra_data?: any;
}

export interface ComplexityFingerprint {
  files: number;
  functions: number;
  classes: number;
  imports: number;
  exports: number;
  branches: number;
  loops: number;
  comments: number;
  blankLines: number;
  language: string;
  languagePercent: number;
  totalLines: number;
  codeLines: number;
}

// Error types for proper error handling
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, any>;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, any>,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.isRetryable = isRetryable;
  }
}

export class GitHubError extends AppError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 400, context, code === 'RATE_LIMIT');
    this.name = 'GitHubError';
  }
}

export class GeminiError extends AppError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 500, context, true);
    this.name = 'GeminiError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTH_ERROR', 401, context, false);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', 0, context, true);
    this.name = 'NetworkError';
  }
}