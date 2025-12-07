import React, { useState } from 'react';
import { Issue } from '../types';
import { AlertTriangle, AlertOctagon, Info, ChevronDown, Wand2, Check } from 'lucide-react';

interface IssueCardProps {
  issue: Issue;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  const [expanded, setExpanded] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const handleCopyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Build prompt dynamically to avoid empty fields
    let prompt = `Fix this issue: ${issue.title}\n\n${issue.description}`;

    // Only add file info if it points to a specific location
    if (issue.filePath && issue.filePath !== 'Repository-wide') {
      prompt += `\n\nFile: ${issue.filePath}:${issue.lineNumber}`;
    }

    // Only add code context if valid code exists
    if (issue.badCode && issue.badCode.trim().length > 0) {
      prompt += `\n\nCode Context:\n${issue.badCode}`;
    }

    // The User's "Signature Move" (Polished)
    prompt += `\n\nPlease fix this issue. Also, analyze the codebase for similar patterns or occurrences of this anti-pattern.`;

    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const getSeverityIcon = () => {
    switch (issue.severity) {
      case 'Critical': return <AlertOctagon className="w-4 h-4 text-red-600" />;
      case 'Warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = () => {
    switch (issue.severity) {
      case 'Critical': return 'text-red-600 bg-red-50';
      case 'Warning': return 'text-amber-600 bg-amber-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div className={`group transition-all duration-200 border border-slate-200 bg-white overflow-hidden ${expanded ? 'rounded-xl shadow-md ring-1 ring-slate-900/5' : 'rounded-lg hover:border-slate-300'}`}>

      {/* Header - Clickable Trigger */}
      <div
        className="px-5 py-4 flex items-start gap-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="mt-0.5 text-slate-400 group-hover:text-slate-600 transition-colors">
          {getSeverityIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h4 className="text-[15px] font-semibold text-slate-900 truncate pr-4">
              {issue.title}
            </h4>
            <div className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${getSeverityColor()}`}>
              {issue.severity}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <p className="font-mono text-xs text-slate-500 truncate">
              {issue.filePath}<span className="text-slate-300 mx-1">:</span>{issue.lineNumber}
            </p>
          </div>
        </div>

        <div className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 animate-slide-up">
          <div className="pl-8">
            <p className="text-sm text-slate-600 leading-relaxed max-w-3xl mb-6">
              {issue.description}
            </p>

            <div className="flex items-center gap-3 mt-4 border-t border-slate-100 pt-4">
              {/* Copy for AI Button - Standalone */}
              <button
                onClick={handleCopyPrompt}
                className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${promptCopied
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-500/30 hover:bg-emerald-50/30 hover:text-emerald-700 hover:shadow-sm'
                  }`}
                title="Copy Prompt for Cursor/Windsurf"
              >
                {promptCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                )}
                <span>{promptCopied ? 'Copied Workflow' : 'Copy for AI'}</span>
              </button>
            </div>

            {/* AI Context / Reasoning (Optional Polish) */}


          </div>
        </div>
      )}
    </div>
  );
};

export default IssueCard;