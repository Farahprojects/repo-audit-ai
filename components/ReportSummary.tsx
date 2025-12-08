import React from 'react';
import { TrendingUp, User } from 'lucide-react';
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

      {/* Token Usage Summary */}
      {(() => {
        // Find the current audit record for token comparison
        const currentAudit = relatedAudits.find(audit =>
          audit.tier === currentTier &&
          audit.repo_url === `https://github.com/${data.repoName}`
        );

        if (currentAudit?.estimated_tokens && currentAudit?.total_tokens) {
          const estimated = currentAudit.estimated_tokens;
          const actual = currentAudit.total_tokens;
          const variance = ((actual - estimated) / estimated * 100);
          const isOverBudget = actual > estimated;

          return (
            <div className="animate-fade-in bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Token Usage Summary</h3>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Estimated</div>
                  <div className="text-lg font-bold text-slate-900">
                    {estimated >= 1000 ? `${(estimated / 1000).toFixed(1)}k` : estimated.toString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Actual</div>
                  <div className="text-lg font-bold text-slate-900">
                    {actual >= 1000 ? `${(actual / 1000).toFixed(1)}k` : actual.toString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-slate-500 text-xs font-medium uppercase tracking-wider mb-1 ${isOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>Variance</div>
                  <div className={`text-lg font-bold ${isOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                    {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
                    {isOverBudget ? ' ⚠️' : ' ✓'}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

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
    </>
  );
};
