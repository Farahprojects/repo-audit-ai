import React, { useState } from 'react';
import { RepoReport } from '../types';
import { CATEGORIES } from '../constants';
import IssueCard from './IssueCard';
import { Download, Share2, GitBranch, AlertCircle, Check, FileText } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row print:bg-white text-foreground font-sans pt-16">

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
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              {data.repoName}
            </h1>
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

        <div className="p-8 max-w-5xl mx-auto space-y-12 print:p-0 print:mt-4">

          {/* Executive Summary */}
          {activeCategory === 'Overview' && (
            <div className="animate-fade-in">
              <h2 className="text-foreground font-semibold text-lg mb-4 flex items-center gap-2">
                Executive Summary
              </h2>
              <div className="text-slate-600 text-[15px] leading-7 max-w-3xl">
                {data.summary}
              </div>
            </div>
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