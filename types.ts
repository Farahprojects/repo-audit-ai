
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

export interface RepoReport {
  repoName: string;
  healthScore: number;
  issues: Issue[];
  summary: string;
  stats: AuditStats;
}
