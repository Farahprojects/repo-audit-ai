
export type ViewState = 'landing' | 'pricing' | 'about' | 'contact' | 'dashboard' | 'preflight' | 'scanning' | 'report';

export type Severity = 'Critical' | 'Warning' | 'Info' | 'Clean';

export type Category = 'Security' | 'Performance' | 'Architecture';

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
}

export interface AuditStats {
  files: number;
  tokens: string;
  language: string;
  languagePercent: number;
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
}
