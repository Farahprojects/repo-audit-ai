import React, { memo, useMemo } from 'react';
import { ViewState, RepoReport, AuditRecord, AuditStats } from '../../../types';
import { FileMapItem } from '../../../services/githubService';
import { useScannerContext } from '../../layout/AppProviders';
import PreflightModal from './PreflightModal';
import Scanner from './Scanner';
import ReportDashboard from '../report/ReportDashboard';

interface AuditFlowProps {
  view: ViewState;
  previousView: ViewState;
  repoUrl: string;
  reportData: RepoReport | null;
  historicalReportData: RepoReport | null;
  relatedAudits: AuditRecord[];
  activeAuditId: string | null;
  onConfirmAudit: (tier: string, stats: AuditStats, fileMap: FileMapItem[], preflightId?: string) => void;
  onCancelPreflight: () => void;
  onRestart: () => void;
  onSelectAudit: (audit: AuditRecord) => void;
  onRunTier: (tier: string, url: string, config?: any) => void;
  onDeleteAudit?: (auditId: string) => void;
}

export const AuditFlow: React.FC<AuditFlowProps> = memo(({
  view,
  previousView,
  repoUrl,
  reportData,
  historicalReportData,
  relatedAudits,
  activeAuditId,
  onConfirmAudit,
  onCancelPreflight,
  onRestart,
  onSelectAudit,
  onRunTier,
  onDeleteAudit,
}) => {
  // Consume scanner context only where it's needed (scanning view)
  const { scannerLogs, scannerProgress } = useScannerContext();
  switch (view) {
    case 'preflight':
      return (
        <PreflightModal
          repoUrl={repoUrl}
          onConfirm={onConfirmAudit}
          onCancel={onCancelPreflight}
        />
      );
    case 'scanning':
      return <Scanner logs={scannerLogs} progress={scannerProgress} />;
    case 'report':
      // Use activeAuditId to determine which data to show
      const displayData = useMemo(() => {
        // If we have an explicit selection, use it
        if (activeAuditId) {
          if (historicalReportData?.auditId === activeAuditId) {
            return historicalReportData;
          }
          if (reportData?.auditId === activeAuditId) {
            return reportData;
          }
        }
        // Fallback: prefer fresh data
        return reportData || historicalReportData;
      }, [activeAuditId, historicalReportData, reportData]);
      return displayData ? (
        <ReportDashboard
          data={displayData}
          relatedAudits={relatedAudits}
          onRestart={onRestart}
          onSelectAudit={onSelectAudit}
          onRunTier={onRunTier}
          onDeleteAudit={onDeleteAudit}
        />
      ) : null;
    default:
      return null;
  }
});
