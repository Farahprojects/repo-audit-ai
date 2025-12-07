import React, { useState, useEffect, useRef } from 'react';
import { Issue } from '../types';
import { AlertTriangle, AlertOctagon, Info, ChevronDown, ChevronUp, Wand2, Copy, Check } from 'lucide-react';

declare const Prism: any;

interface IssueCardProps {
  issue: Issue;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue }) => {
  const [expanded, setExpanded] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (expanded && codeRef.current && typeof Prism !== 'undefined') {
      Prism.highlightElement(codeRef.current);
    }
  }, [expanded, showFix]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = showFix ? issue.fixedCode : issue.badCode;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = `Fix this issue: ${issue.title}\n\n${issue.description}\n\nFile: ${issue.filePath}:${issue.lineNumber}\n\nCode Context:\n${issue.badCode}\n\nmore ai please issue and look for others that have similar pattens or something like that`;
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
            {issue.sections && issue.sections.length > 0 ? (
              <div className="space-y-6 mb-6">
                {issue.sections.map((section, idx) => (
                  <div key={idx}>
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      {section.label}
                    </h5>
                    <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed max-w-3xl mb-6">
                {issue.description}
              </p>
            )}

            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-900 shadow-sm">
              {/* Minimal Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/50">
                <div className="flex gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setShowFix(false)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${!showFix
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setShowFix(true)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all flex items-center gap-1.5 ${showFix
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    Fix <Wand2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 select-none hidden sm:block">
                    {showFix ? 'Proposed Change' : 'Current State'}
                  </span>

                  {/* Copy for AI Button */}
                  <button
                    onClick={handleCopyPrompt}
                    className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium rounded-md transition-all border ${promptCopied
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 border-transparent hover:border-slate-700'
                      }`}
                    title="Copy Prompt for Cursor/Windsurf"
                  >
                    {promptCopied ? <Check className="w-3 h-3" /> : <Wand2 className="w-3 h-3" />}
                    <span className="hidden sm:inline">{promptCopied ? 'Copied Workflow' : 'Copy for AI'}</span>
                  </button>

                  <div className="w-px h-3 bg-slate-800 mx-1"></div>

                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-md hover:bg-slate-800"
                    title="Copy Code Only"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Code Area */}
              <div className="relative bg-slate-950">
                <div className="p-4 text-xs overflow-x-auto font-mono leading-relaxed custom-scrollbar">
                  <pre style={{ margin: 0, padding: 0, background: 'transparent' }}>
                    <code ref={codeRef} className="language-typescript text-slate-200">
                      {showFix ? issue.fixedCode : issue.badCode}
                    </code>
                  </pre>
                </div>
              </div>
            </div>

            {/* AI Context / Reasoning (Optional Polish) */}
            {showFix && (
              <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/50">
                <Wand2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>AI suggests this fix to resolve the {issue.severity.toLowerCase()} issue. Always review before applying.</span>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default IssueCard;