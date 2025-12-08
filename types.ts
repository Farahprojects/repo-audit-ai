export type ViewState = 'landing' | 'pricing' | 'about' | 'contact' | 'dashboard' | 'preflight' | 'scanning' | 'report';

export type AuditTier = 'shape' | 'conventions' | 'performance' | 'security' | 'supabase_deep_dive';
export type Severity = 'Critical' | 'Warning' | 'Info' | 'Clean';

export type Category = 'Security' | 'Performance' | 'Architecture';

export interface IssueSection {
  label: string;
  content: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: Category;
  severity: Severity;
  filePath: string;
  lineNumber: number;
  badCode: string;
  fixedCode: string;
  sections?: IssueSection[];
}

export interface AuditStats {
  files: number;
  tokens: string;
  size: string;
  language: string;
  languagePercent: number;
  defaultBranch?: string;
  stars?: number;
  forks?: number;
  issues?: number;
  watchers?: number;
  isPrivate?: boolean;
  hasWiki?: boolean;
  hasPages?: boolean;
  archived?: boolean;
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  pushedAt?: string;
  fingerprint?: ComplexityFingerprint;
}

export interface StrengthOrIssue {
  title: string;
  detail: string;
}

export interface SuspiciousFiles {
  present: string[];
  missing: string[];
}

export interface CategoryAssessments {
  architecture: string;
  codeQuality: string;
  security: string;
  dependencies: string;
  database: string;
  documentation: string;
  deployment: string;
  maintenance: string;
}

export interface SeniorDeveloperAssessment {
  isSeniorLevel: boolean;
  justification: string;
}

export interface RepoReport {
  repoName: string;
  healthScore: number;
  issues: Issue[];
  summary: string;
  stats: AuditStats;
  // Enhanced report fields
  topStrengths?: StrengthOrIssue[];
  topIssues?: StrengthOrIssue[];
  suspiciousFiles?: SuspiciousFiles;
  categoryAssessments?: CategoryAssessments;
  seniorDeveloperAssessment?: SeniorDeveloperAssessment;
  overallVerdict?: string;
  productionReady?: boolean;
  riskLevel?: 'critical' | 'high' | 'medium' | 'low';
  tier?: string;
  auditId?: string;
  detectedStack?: {
    supabase: boolean;
    firebase: boolean;
    prisma: boolean;
    drizzle: boolean;
    neon: boolean;
    graphql: boolean;
    hasDockerfile: boolean;
  };
}

export interface ComplexityFingerprint {
  // Basic metrics (already available)
  file_count: number;
  total_size_kb: number;
  token_estimate: number;

  // Language breakdown
  language_mix: Record<string, number>; // { ts: 65, python: 30, sql: 5 }
  primary_language: string;

  // File type counts (NEW - computed from tree)
  sql_files: number;
  config_files: number;  // yaml, json, toml, env
  frontend_files: number; // tsx, jsx, vue, svelte
  backend_files: number;  // ts, py, go, rs (in src/server/api folders)
  test_files: number;

  // Detection flags (already have some via techStack)
  has_supabase: boolean;
  has_docker: boolean;
  has_env_files: boolean;
  has_tests: boolean;
  is_monorepo: boolean;

  // Dependency info (if package.json accessible)
  dependency_count: number;

  // API surface hints
  api_endpoints_estimated: number; // Based on route file patterns
}

// Audit record from database (for history)
export interface AuditRecord {
  id: string;
  repo_url: string;
  tier: string;
  health_score: number | null;
  summary: string | null;
  created_at: string;
  issues: any;
  extra_data: any;
  estimated_tokens?: number;
  total_tokens?: number;
}
