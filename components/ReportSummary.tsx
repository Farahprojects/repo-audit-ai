import React from 'react';
import { RepoReport, AuditRecord } from '../types';

interface ReportSummaryProps {
  data: RepoReport;
  relatedAudits: AuditRecord[];
  currentTier: string;
}

export const ReportSummary: React.FC<ReportSummaryProps> = ({
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
        </h2>
        <div className="text-slate-600 text-[15px] leading-7 max-w-3xl">
          {data.summary}
        </div>
      </div>


    </>
  );
};
