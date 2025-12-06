import React, { useState } from 'react';
import { RepoReport } from '../types';
import { CATEGORIES } from '../constants';
import IssueCard from './IssueCard';
import { Download, Share2, GitBranch, Check, FileText, Star, AlertTriangle, User, FileQuestion, Shield, Zap, Database, FileCode, Rocket, Wrench, FolderTree, ChevronRight } from 'lucide-react';
import { TierUpsellPanel, AuditTier } from './TierBadges';

interface ReportDashboardProps {
  data: RepoReport & { tier?: string };
  onRestart: () => void;
  onRunTier?: (tier: AuditTier, repoUrl: string) => void;
  completedTiers?: string[];
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ data, onRestart, onRunTier, completedTiers = [] }) => {
  const [activeCategory, setActiveCategory] = useState<string>('Overview');
  const [copied, setCopied] = useState(false);

  const filteredIssues = activeCategory === 'Overview'
    ? data.issues
    : data.issues.filter(i => i.category === activeCategory);

  const getCount = (catId: string) => {
    if (catId === 'Overview') return data.issues.length;
    return data.issues.filter(i => i.category === catId).length;
  };

  const healthColor = data.healthScore > 80 ? 'text-success'
    : data.healthScore > 60 ? 'text-warning'
      : 'text-critical';

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Title', 'Severity', 'Category', 'File Path', 'Line Number', 'Description'];
    const rows = data.issues.map(issue => [
      issue.id,
      `"${issue.title.replace(/"/g, '""')}"`,
      issue.severity,
      issue.category,
      issue.filePath,
      issue.lineNumber,
      `"${issue.description.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${data.repoName}_audit_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const riskBadgeColor = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const categoryIcons: Record<string, React.ElementType> = {
    architecture: FolderTree,
    codeQuality: FileCode,
    security: Shield,
    dependencies: Zap,
    database: Database,
    documentation: FileText,
    deployment: Rocket,
    maintenance: Wrench,
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row print:bg-white text-foreground font-sans pt-32">

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-background border-r border-border p-5 flex flex-col sticky top-16 h-[calc(100vh-4rem)] print:hidden z-20">
        <nav className="space-y-1 flex-1 mt-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${activeCategory === cat.id
                ? 'bg-slate-100 text-foreground font-medium'
                : 'text-slate-500 hover:text-foreground hover:bg-slate-50/80 font-normal'
                }`}
            >
              <div className="flex items-center gap-3">
                <cat.icon className={`w-4 h-4 ${activeCategory === cat.id ? 'text-foreground' : 'text-slate-400'}`} />
                {cat.label}
              </div>
              {cat.id !== 'Overview' && getCount(cat.id) > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${activeCategory === cat.id ? 'bg-white text-foreground shadow-sm ring-1 ring-slate-200' : 'text-slate-400'
                  }`}>
                  {getCount(cat.id)}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-border space-y-6">
          {/* Upsell Panel */}
          {onRunTier && (
            <TierUpsellPanel
              completedTiers={completedTiers.length > 0 ? completedTiers : [data.tier || 'shape']}
              repoUrl={`https://github.com/${data.repoName}`}
              onRunTier={(tier) => onRunTier(tier, `https://github.com/${data.repoName}`)}
            />
          )}

          {/* Health Score - Minimal */}
          <div className="px-1">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500">Health Score</span>
              <span className={`text-2xl font-bold tracking-tight ${healthColor}`}>{data.healthScore}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${data.healthScore > 80 ? 'bg-emerald-500' : data.healthScore > 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${data.healthScore}%` }}
              ></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto print:overflow-visible bg-white">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-border sticky top-0 z-10 px-8 py-4 flex justify-between items-center print:static print:border-none">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">
                {data.repoName}
              </h1>
              {data.riskLevel && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${riskBadgeColor[data.riskLevel]}`}>
                  {data.riskLevel.toUpperCase()} RISK
                </span>
              )}
              {data.productionReady !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${data.productionReady ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                  {data.productionReady ? '✓ PRODUCTION READY' : '⚠ NOT PRODUCTION READY'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <GitBranch className="w-3 h-3" />
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">main</span>
              <span>•</span>
              <span>Last scanned just now</span>
            </div>
          </div>

          <div className="flex items-center gap-1 print:hidden">
            <button
              onClick={handleShare}
              className="p-2 text-slate-400 hover:text-foreground hover:bg-slate-50 rounded-md transition-all"
              title="Share Report"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleExportCSV}
              className="p-2 text-slate-400 hover:text-foreground hover:bg-slate-50 rounded-md transition-all"
              title="Export CSV"
            >
              <FileText className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-slate-200 mx-1"></div>
            <button
              onClick={handleExportPDF}
              className="px-4 py-1.5 text-xs font-medium bg-foreground text-background hover:bg-slate-800 rounded-lg transition-all shadow-sm flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </header>

        <div className="p-8 max-w-5xl mx-auto space-y-8 print:p-0 print:mt-4">

          {activeCategory === 'Overview' && (
            <>
              {/* Executive Summary */}
              <div className="animate-fade-in">
                <h2 className="text-foreground font-semibold text-lg mb-3 flex items-center gap-2">
                  Executive Summary
                </h2>
                <div className="text-slate-600 text-[15px] leading-7 max-w-3xl">
                  {data.summary}
                </div>
              </div>

              {/* Senior Developer Assessment */}
              {data.seniorDeveloperAssessment && (
                <div className="animate-fade-in bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${data.seniorDeveloperAssessment.isSeniorLevel ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                      <User className={`w-5 h-5 ${data.seniorDeveloperAssessment.isSeniorLevel ? 'text-emerald-600' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Senior Developer Assessment</h3>
                      <span className={`text-sm font-medium ${data.seniorDeveloperAssessment.isSeniorLevel ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {data.seniorDeveloperAssessment.isSeniorLevel ? '✓ YES - Senior Level' : '○ Not Yet Senior Level'}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed pl-13">
                    {data.seniorDeveloperAssessment.justification}
                  </p>
                </div>
              )}

              {/* Top Strengths & Issues Grid */}
              {(data.topStrengths || data.topIssues) && (
                <div className="grid md:grid-cols-2 gap-6 animate-fade-in">
                  {/* Strengths */}
                  {data.topStrengths && data.topStrengths.length > 0 && (
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5">
                      <h3 className="font-semibold text-emerald-800 mb-4 flex items-center gap-2">
                        <Star className="w-4 h-4" />
                        Top {data.topStrengths.length} Strengths
                      </h3>
                      <ul className="space-y-3">
                        {data.topStrengths.map((strength, i) => (
                          <li key={i} className="flex gap-3">
                            <ChevronRight className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium text-emerald-900 text-sm">{strength.title}</span>
                              <p className="text-emerald-700 text-xs mt-0.5">{strength.detail}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Issues */}
                  {data.topIssues && data.topIssues.length > 0 && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5">
                      <h3 className="font-semibold text-amber-800 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Top {data.topIssues.length} Issues
                      </h3>
                      <ul className="space-y-3">
                        {data.topIssues.map((issue, i) => (
                          <li key={i} className="flex gap-3">
                            <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium text-amber-900 text-sm">{issue.title}</span>
                              <p className="text-amber-700 text-xs mt-0.5">{issue.detail}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Category Assessments */}
              {data.categoryAssessments && (
                <div className="animate-fade-in">
                  <h3 className="font-semibold text-foreground mb-4">Category Breakdown</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(data.categoryAssessments).map(([key, value]) => {
                      const Icon = categoryIcons[key] || FileText;
                      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                      return (
                        <div key={key} className="bg-slate-50 border border-slate-100 rounded-lg p-3 hover:border-slate-200 transition-all">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-semibold text-slate-700">{label}</span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Suspicious Files */}
              {data.suspiciousFiles && (data.suspiciousFiles.present?.length > 0 || data.suspiciousFiles.missing?.length > 0) && (
                <div className="animate-fade-in bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <FileQuestion className="w-4 h-4 text-slate-500" />
                    Suspicious / Missing Files
                  </h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    {data.suspiciousFiles.present?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Present but Concerning</h4>
                        <ul className="space-y-1">
                          {data.suspiciousFiles.present.map((file, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-amber-500 mt-1">•</span>
                              {file}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.suspiciousFiles.missing?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Missing Expected Files</h4>
                        <ul className="space-y-1">
                          {data.suspiciousFiles.missing.map((file, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-red-500 mt-1">•</span>
                              {file}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Overall Verdict */}
              {data.overallVerdict && (
                <div className="animate-fade-in border-l-4 border-slate-300 pl-5 py-2">
                  <h3 className="font-semibold text-foreground mb-2">Overall Verdict</h3>
                  <p className="text-slate-600 text-[15px] leading-7">{data.overallVerdict}</p>
                </div>
              )}
            </>
          )}

          {/* Issues List */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              {activeCategory === 'Overview' ? 'All Findings' : `${activeCategory} Findings`}
              <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full border border-slate-200 font-medium">{filteredIssues.length}</span>
            </h3>

            {filteredIssues.length === 0 ? (
              <div className="text-center py-16 bg-surface border border-dashed border-slate-300 rounded-lg">
                <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-foreground font-medium text-sm mb-1">All Clear</h4>
                <p className="text-slate-500 text-xs">No issues detected in this category.</p>
              </div>
            ) : (
              filteredIssues.map((issue) => (
                <div key={issue.id} className="break-inside-avoid">
                  <IssueCard issue={issue} />
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ReportDashboard;
