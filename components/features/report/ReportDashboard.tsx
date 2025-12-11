import React from 'react';
import { RepoReport, AuditRecord, AuditTier } from '../../../types';
import { UniversalConnectModal } from '../auth/UniversalConnectModal';
import { ReportHeader } from './ReportHeader';
import { ReportSummary } from './ReportSummary';
import { ReportSections } from './ReportSections';
import { ReportIssues } from './ReportIssues';
import { AuditHistoryDropdown } from '../dashboard/AuditHistoryDropdown';
import { AuditUpgradesDropdown } from '../dashboard/AuditUpgradesDropdown';
import { useReportState } from '../../../hooks/useReportState';
import { useDropdownPositioning } from '../../../hooks/useDropdownPositioning';

interface ReportDashboardProps {
  data: RepoReport;
  relatedAudits: AuditRecord[];
  onRestart: () => void;
  onRunTier?: (tier: AuditTier, repoUrl: string, config?: any) => void;
  onSelectAudit?: (audit: AuditRecord) => void;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({
  data,
  relatedAudits,
  onRestart,
  onRunTier,
  onSelectAudit
}) => {
  // Get repoUrl from first related audit, fallback to constructed URL
  const repoUrl = relatedAudits[0]?.repo_url || `https://github.com/${data.repoName}`;
  const reportState = useReportState({ data, relatedAudits, onRunTier, onSelectAudit });

  useDropdownPositioning({
    dropdownRef: reportState.dropdownRef,
    tierButtonRefs: reportState.tierButtonRefs,
    upgradesButtonRef: reportState.upgradesButtonRef,
    historyDropdownOpen: reportState.historyDropdownOpen,
    upgradesDropdownOpen: reportState.upgradesDropdownOpen,
    setHistoryDropdownOpen: reportState.setHistoryDropdownOpen,
    setUpgradesDropdownOpen: reportState.setUpgradesDropdownOpen,
  });

  return (
    <div className="min-h-screen bg-surface flex flex-col print:bg-white text-foreground font-sans pt-32">
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto print:overflow-visible bg-white">
        <ReportHeader
          data={data}
          relatedAudits={relatedAudits}
          auditsByTier={reportState.auditsByTier}
          completedTiers={reportState.completedTiers}
          activeTier={reportState.activeTier}
          historyDropdownOpen={reportState.historyDropdownOpen}
          upgradesDropdownOpen={reportState.upgradesDropdownOpen}
          copied={reportState.copied}
          onTierClick={reportState.handleTierClick}
          onUpgradesClick={reportState.handleUpgradesClick}
          onShare={reportState.handleShare}
          onExportCSV={reportState.handleExportCSV}
          onRunTier={onRunTier}
          tierButtonRefs={reportState.tierButtonRefs}
          upgradesButtonRef={reportState.upgradesButtonRef}
        />

        <div className="p-8 max-w-5xl mx-auto space-y-8 print:p-0 print:mt-4">
          <ReportSummary
            data={data}
            relatedAudits={relatedAudits}
            currentTier={reportState.currentTier}
          />

          <ReportSections
            data={data}
            onRunDeepAudit={reportState.handleRunDeepAudit}
            onRunTier={onRunTier}
          />

          <ReportIssues data={data} />
        </div>
      </main>

      <AuditHistoryDropdown
        auditsByTier={reportState.auditsByTier}
        historyDropdownOpen={reportState.historyDropdownOpen}
        dropdownPosition={reportState.dropdownPosition}
        dropdownRef={reportState.dropdownRef}
        formatDate={reportState.formatDate}
        onSelectAudit={onSelectAudit}
        onCloseDropdown={() => reportState.setHistoryDropdownOpen(null)}
        onRunTier={onRunTier}
        repoUrl={repoUrl}
      />

      <AuditUpgradesDropdown
        upgradesDropdownOpen={reportState.upgradesDropdownOpen}
        dropdownPosition={reportState.dropdownPosition}
        dropdownRef={reportState.dropdownRef}
        completedTiers={reportState.completedTiers}
        onRunTier={onRunTier}
        onCloseDropdown={() => reportState.setUpgradesDropdownOpen(false)}
        repoUrl={repoUrl}
      />

      <UniversalConnectModal
        isOpen={reportState.isConnectModalOpen}
        onClose={() => reportState.setIsConnectModalOpen(false)}
        onSubmit={reportState.handleConnectSubmit}
        provider={reportState.pendingProvider}
      />
    </div>
  );
};

export default ReportDashboard;
