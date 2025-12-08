import React from 'react';
import { ViewState, RepoReport, AuditRecord } from '../types';
import PreflightModal from './PreflightModal';
import Scanner from './Scanner';
import ReportDashboard from './ReportDashboard';

interface AuditFlowProps {
  view: ViewState;
  previousView: ViewState;
  repoUrl: string;
  scannerLogs: string[];
  scannerProgress: number;
  reportData: RepoReport | null;
  historicalReportData: RepoReport | null;
  relatedAudits: AuditRecord[];
  onConfirmAudit: (tier: string, stats: any) => void;
  onCancelPreflight: () => void;
  onRestart: () => void;
  onSelectAudit: (audit: AuditRecord) => void;
  onRunTier: (tier: string, url: string, config?: any) => void;
}

export const AuditFlow: React.FC<AuditFlowProps> = ({
  view,
  previousView,
  repoUrl,
  scannerLogs,
  scannerProgress,
  reportData,
  historicalReportData,
  relatedAudits,
  onConfirmAudit,
  onCancelPreflight,
  onRestart,
  onSelectAudit,
  onRunTier,
}) => {
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
      const displayData = reportData || historicalReportData;
      return displayData ? (
        <ReportDashboard
          data={displayData}
          relatedAudits={relatedAudits}
          onRestart={onRestart}
          onSelectAudit={onSelectAudit}
          onRunTier={onRunTier}
        />
      ) : null;
    default:
      return null;
  }
};
