import React, { useState } from 'react';
import { RepoReport } from '../types';
import { CATEGORIES } from '../constants';
import IssueCard from './IssueCard';
import { Download, Share2, GitBranch, AlertCircle, Check, FileText } from 'lucide-react';

interface ReportDashboardProps {
  data: RepoReport;
  onRestart: () => void;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ data, onRestart }) => {
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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row print:bg-white">
      
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 p-6 flex flex-col sticky top-0 h-auto md:h-screen print:hidden shadow-sm z-20">
        <div 
          onClick={onRestart}
          className="text-xl font-bold text-slate-900 mb-10 flex items-center gap-2 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
             <div className="w-3 h-3 bg-white rounded-full"></div>
          </div>
          SCAI
        </div>

        <nav className="space-y-2 flex-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-full text-sm font-semibold transition-all duration-200 ${
                activeCategory === cat.id 
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <cat.icon className={`w-4 h-4 ${activeCategory === cat.id ? 'text-white' : 'text-slate-400'}`} />
                {cat.label}
              </div>
              {cat.id !== 'Overview' && getCount(cat.id) > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    activeCategory === cat.id ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-600'
                }`}>
                  {getCount(cat.id)}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="bg-slate-50 rounded-3xl p-6 text-center border border-slate-100">
            <p className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">Overall Health</p>
            <div className={`text-5xl font-bold ${healthColor} mb-2`}>
                 {data.healthScore}
            </div>
            <div className="text-xs text-slate-500 font-medium bg-white px-3 py-1 rounded-full inline-block shadow-sm">
                 {data.issues.length} Issues Found
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto print:overflow-visible">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10 px-8 py-5 flex justify-between items-center print:static print:bg-white print:border-none">
           <div>
             <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
               {data.repoName}
               <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200">
                 <GitBranch className="w-3 h-3" /> main
               </span>
             </h1>
             <p className="text-xs text-slate-400 mt-1 pl-1">
               Last scanned: Just now
             </p>
           </div>
           
           <div className="flex gap-3 print:hidden">
             <button 
               onClick={handleShare}
               className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 transition-all shadow-sm"
             >
               {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
               {copied ? 'Copied' : 'Share'}
             </button>
             <button 
               onClick={handleExportCSV}
               className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 transition-all shadow-sm"
             >
               <FileText className="w-4 h-4" /> CSV
             </button>
             <button 
               onClick={handleExportPDF}
               className="px-5 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-full hover:bg-slate-800 flex items-center gap-2 shadow-lg shadow-slate-900/10"
             >
               <Download className="w-4 h-4" /> Report
             </button>
           </div>
        </header>

        <div className="p-8 max-w-5xl mx-auto space-y-8 print:p-0 print:mt-8">
          
          {/* Executive Summary */}
          {activeCategory === 'Overview' && (
             <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm">
               <h2 className="text-slate-900 font-bold text-lg mb-3 flex items-center gap-2">
                 <AlertCircle className="w-5 h-5 text-primary" /> Executive Summary
               </h2>
               <p className="text-slate-600 leading-relaxed">
                 {data.summary}
               </p>
             </div>
          )}

          {/* Issues List */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {activeCategory === 'Overview' ? 'All Findings' : `${activeCategory} Findings`}
              <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full">{filteredIssues.length}</span>
            </h3>
            
            {filteredIssues.length === 0 ? (
              <div className="text-center py-24 bg-white border border-dashed border-slate-300 rounded-3xl">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h4 className="text-slate-900 font-bold mb-1">All Clear</h4>
                <p className="text-slate-500">No issues detected in this category.</p>
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