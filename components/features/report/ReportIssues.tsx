import React, { memo } from 'react';
import { Check } from 'lucide-react';
import { RepoReport } from '../../../types';
import IssueCard from './IssueCard';

interface ReportIssuesProps {
  data: RepoReport;
}

export const ReportIssues: React.FC<ReportIssuesProps> = memo(({ data }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
        All Findings
        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full border border-slate-200 font-medium">{data.issues.length}</span>
      </h3>

      {data.issues.length === 0 ? (
        <div className="text-center py-16 bg-surface border border-dashed border-slate-300 rounded-lg">
          <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-emerald-500" />
          </div>
          <h4 className="text-foreground font-medium text-sm mb-1">All Clear</h4>
          <p className="text-slate-500 text-xs">No issues detected.</p>
        </div>
      ) : (
        data.issues.map((issue) => (
          <div key={issue.id} className="break-inside-avoid">
            <IssueCard issue={{
              ...issue,
              sections: issue.sections && issue.sections.length > 0 ? issue.sections : [
                { label: "Explanation", content: issue.description },
              ]
            }} />
          </div>
        ))
      )}
    </div>
  );
});
