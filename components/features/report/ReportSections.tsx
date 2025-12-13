import React, { memo } from 'react';
import { Star, AlertTriangle, FileQuestion, FolderTree, FileCode, Shield, Zap, Database, FileText, Rocket, Wrench } from 'lucide-react';
import { RepoReport } from '../../../types';

interface ReportSectionsProps {
  data: RepoReport;
  onRunDeepAudit: (tierId: string, provider: string) => void;
  onRunTier?: (tier: string, repoUrl: string, config?: any) => void;
}

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

export const ReportSections: React.FC<ReportSectionsProps> = memo(({
  data,
  onRunDeepAudit,
  onRunTier,
}) => {
  return (
    <>
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

    </>
  );
});
