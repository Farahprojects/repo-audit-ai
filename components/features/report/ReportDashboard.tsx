import React, { useState, memo, useCallback } from 'react';
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
import DeleteConfirmModal from '../../common/DeleteConfirmModal';
import { useAuditData } from '../../../hooks/useAuditData';
import { usePreflightStore } from '../../../stores';
import { useRouterContext } from '../../layout/AppProviders';
import { deleteService } from '../../../services/deleteService';

/**
 * ReportDashboard - Zustand pointer-layer version
 * 
 * Props reduced from 6 to 2 (optional callbacks for tier running).
 * Data fetched by ID from stores via useAuditData hook.
 */
interface ReportDashboardProps {
  // Optional callbacks for running new tiers (passed from parent for now)
  onRunTier?: (tier: AuditTier, repoUrl: string, config?: any) => void;
  onRestart?: () => void;
}

const ReportDashboard: React.FC<ReportDashboardProps> = memo(({
  onRunTier,
  onRestart,
}) => {
  // Get data from Zustand stores via bridge hook
  const {
    activeReport: data,
    relatedAudits,
    selectAudit,
    deleteAudit,
    loading,
  } = useAuditData();

  const repoUrlFromStore = usePreflightStore((state) => state.repoUrl);
  const { navigate } = useRouterContext();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [auditToDelete, setAuditToDelete] = useState<AuditRecord | null>(null);

  // Handle restart - navigate back to landing
  const handleRestart = useCallback(() => {
    if (onRestart) {
      onRestart();
    } else {
      navigate('landing');
    }
  }, [onRestart, navigate]);

  // Use existing UI state hook - MUST be called before any early returns
  const reportState = useReportState({
    data: data || { issues: [], repoName: '', tier: 'shape' } as any,
    relatedAudits: relatedAudits || [],
    onRunTier,
    onSelectAudit: selectAudit
  });

  useDropdownPositioning({
    dropdownRef: reportState.dropdownRef,
    tierButtonRefs: reportState.tierButtonRefs,
    upgradesButtonRef: reportState.upgradesButtonRef,
    historyDropdownOpen: reportState.historyDropdownOpen,
    upgradesDropdownOpen: reportState.upgradesDropdownOpen,
    setHistoryDropdownOpen: reportState.setHistoryDropdownOpen,
    setUpgradesDropdownOpen: reportState.setUpgradesDropdownOpen,
  });

  // If no data yet, show loading or empty state
  if (!data) {
    if (loading) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <div className="text-muted-foreground">Loading report...</div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted-foreground">No report data available</div>
      </div>
    );
  }

  // Get repoUrl from store or construct from data
  const rawRepoUrl = repoUrlFromStore || relatedAudits[0]?.repo_url || `https://github.com/${data.repoName}`;
  const repoUrl = rawRepoUrl.startsWith('https://') ? rawRepoUrl : `https://github.com/${rawRepoUrl}`;

  const handleDeleteAuditClick = (audit: AuditRecord) => {
    setAuditToDelete(audit);
    setShowDeleteModal(true);
  };

  const handleConfirmDeleteAudit = async () => {
    if (auditToDelete) {
      // Delete from backend
      await deleteService.deleteAudit(auditToDelete.id);
      // Update local cache
      await deleteAudit(auditToDelete.id);
      setShowDeleteModal(false);
      setAuditToDelete(null);
      reportState.setHistoryDropdownOpen(null);
    }
  };

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
          onCopyIssues={reportState.handleCopyIssues}
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
        onSelectAudit={selectAudit}
        onCloseDropdown={() => reportState.setHistoryDropdownOpen(null)}
        onRunTier={onRunTier}
        onDeleteAudit={handleDeleteAuditClick}
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

      {/* Delete Audit Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        title="Delete Audit"
        message={`Are you sure you want to delete this audit from ${reportState.formatDate(auditToDelete?.created_at || '')}? This action cannot be undone.`}
        confirmText="Delete Audit"
        onConfirm={handleConfirmDeleteAudit}
        onCancel={() => {
          setShowDeleteModal(false);
          setAuditToDelete(null);
        }}
      />
    </div>
  );
});

export default ReportDashboard;
