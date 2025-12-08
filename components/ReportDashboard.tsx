import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { RepoReport } from '../types';
import { CATEGORIES } from '../constants';
import IssueCard from './IssueCard';
import { Download, Share2, GitBranch, Check, FileText, Star, AlertTriangle, User, FileQuestion, Shield, Zap, Database, FileCode, Rocket, Wrench, FolderTree, ChevronRight, ChevronDown } from 'lucide-react';
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
  const [upgradesDropdownOpen, setUpgradesDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setUpgradesDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleUpgradesClick = () => {
    if (!upgradesDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
    }
    setUpgradesDropdownOpen(!upgradesDropdownOpen);
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
    <div className="min-h-screen bg-surface flex flex-col print:bg-white text-foreground font-sans pt-32">


      {/* Main Content */}
      <main className="flex-1 overflow-y-auto print:overflow-visible bg-white">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-border sticky top-0 z-10 px-8 py-4 print:static print:border-none">
          {/* Top Row: Repo Info */}
          <div className="flex items-center gap-3 mb-4">
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

          {/* Second Row: Branch Info */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
            <GitBranch className="w-3 h-3" />
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">main</span>
            <span>•</span>
            <span>Last scanned just now</span>
          </div>

          {/* Third Row: Navigation + Actions */}
          <div className="flex items-center justify-between relative">
            {/* Category Navigation - Left */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
                    activeCategory === cat.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <cat.icon className="w-4 h-4" />
                  {cat.label}
                  {cat.id !== 'Overview' && getCount(cat.id) > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      activeCategory === cat.id
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {getCount(cat.id)}
                    </span>
                  )}
                </button>
              ))}

              {/* Upgrades Dropdown Button */}
              {onRunTier && (
                <div className="relative inline-block ml-1">
                  <button
                    ref={buttonRef}
                    onClick={handleUpgradesClick}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
                      upgradesDropdownOpen
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    Upgrades
                    <ChevronDown className={`w-3 h-3 transition-transform ${upgradesDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons - Far Right */}
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
                <Download className="w-4 h-4" />
              </button>
            </div>
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

              {/* Top Strengths & Issues - Clean List Design */}
              {(data.topStrengths?.length || data.topIssues?.length) ? (
                <div className="space-y-6 animate-fade-in">
                  {/* Strengths */}
                  {data.topStrengths && data.topStrengths.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <Star className="w-4 h-4 text-emerald-500" />
                        Key Strengths
                      </h3>
                      <div className="space-y-2">
                        {data.topStrengths.map((strength, i) => (
                          <div key={i} className="border-l-2 border-emerald-400 pl-4 py-2 bg-emerald-50/30 rounded-r-lg">
                            <span className="font-medium text-foreground text-sm block">{strength.title}</span>
                            {strength.detail && (
                              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{strength.detail}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weaknesses/Issues */}
                  {data.topIssues && data.topIssues.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Areas for Improvement
                      </h3>
                      <div className="space-y-2">
                        {data.topIssues.map((issue, i) => (
                          <div key={i} className="border-l-2 border-amber-400 pl-4 py-2 bg-amber-50/30 rounded-r-lg">
                            <span className="font-medium text-foreground text-sm block">{issue.title}</span>
                            {issue.detail && (
                              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{issue.detail}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

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
                  <IssueCard issue={{
                    ...issue,
                    // TODO: Remove this mock data after verification
                    sections: issue.sections && issue.sections.length > 0 ? issue.sections : [
                      { label: "Explanation", content: issue.description },
                      { label: "Impact", content: "This is a mock impact section to verify the UI rendering of the new design blocks." },
                      { label: "Recommendation", content: "This is a mock recommendation section." }
                    ]
                  }} />
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Upgrades Dropdown Portal */}
      {upgradesDropdownOpen && dropdownPosition && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] p-4 max-h-96 overflow-y-auto"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          <TierUpsellPanel
            completedTiers={completedTiers}
            repoUrl={`https://github.com/${data.repoName}`}
            onRunTier={(tier) => {
              onRunTier(tier, `https://github.com/${data.repoName}`);
              setUpgradesDropdownOpen(false);
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default ReportDashboard;
