import React, { memo, useCallback } from 'react';
import { ViewState, AuditStats, AuditTier } from '../../../types';
import { FileMapItem } from '../../../services/githubService';
import { useScannerStore } from '../../../stores';
import { useScannerContext } from '../../layout/AppProviders';
import PreflightModal from './PreflightModal';
import Scanner from './Scanner';
import ReportDashboard from '../report/ReportDashboard';

/**
 * AuditFlow - Zustand pointer-layer version
 * 
 * Props reduced from 12+ to essential view/navigation only.
 * Data flows through Zustand stores, not props.
 */
interface AuditFlowProps {
  view: ViewState;
  repoUrl: string;
  onConfirmAudit: (tier: string, stats: AuditStats, fileMap: FileMapItem[], preflightId?: string) => void;
  onCancelPreflight: () => void;
  onRestart: () => void;
  onRunTier: (tier: string, url: string, config?: any) => void;
}

export const AuditFlow: React.FC<AuditFlowProps> = memo(({
  view,
  repoUrl,
  onConfirmAudit,
  onCancelPreflight,
  onRestart,
  onRunTier,
}) => {
  // Scanner data from context (still using context for now, will migrate later)
  const { scannerLogs, scannerProgress } = useScannerContext();

  // Cast onRunTier to proper type for ReportDashboard
  const handleRunTier = useCallback((tier: AuditTier, url: string, config?: any) => {
    onRunTier(tier, url, config);
  }, [onRunTier]);

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
      // ReportDashboard now gets data from stores via useAuditData hook
      return (
        <ReportDashboard
          onRestart={onRestart}
          onRunTier={handleRunTier}
        />
      );
    default:
      return null;
  }
});
