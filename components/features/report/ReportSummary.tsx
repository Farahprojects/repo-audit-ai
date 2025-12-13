import React, { memo } from 'react';
import { RepoReport, AuditRecord } from '../../../types';

interface ReportSummaryProps {
  data: RepoReport;
  relatedAudits: AuditRecord[];
  currentTier: string;
}

const getHealthScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
};

export const ReportSummary: React.FC<ReportSummaryProps> = memo(({
  data,
  relatedAudits,
  currentTier,
}) => {
  return (
    <>
      {/* Executive Summary */}
      <div className="animate-fade-in">
        <h2 className="text-foreground font-semibold text-lg mb-3 flex items-center gap-2">
          Executive Summary
          <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getHealthScoreColor(data.healthScore)}`}>
            {data.healthScore}/100
          </span>
        </h2>
        <div className="text-slate-600 text-[15px] leading-7 max-w-3xl">
          {data.summary}
        </div>
      </div>


    </>
  );
});
