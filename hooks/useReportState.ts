import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RepoReport, AuditRecord, AuditTier } from '../types';
import { TIERS } from '../components/common/TierBadges';
import { ConnectProvider } from '../components/features/auth/UniversalConnectModal';

interface UseReportStateProps {
  data: RepoReport;
  relatedAudits: AuditRecord[];
  onRunTier?: (tier: AuditTier, repoUrl: string, config?: any) => void;
  onSelectAudit?: (audit: AuditRecord) => void;
}

export const useReportState = ({ data, relatedAudits, onRunTier, onSelectAudit }: UseReportStateProps) => {
  // Group audits by tier
  const auditsByTier = useMemo(() => {
    const grouped: Record<string, AuditRecord[]> = {};
    relatedAudits.forEach(audit => {
      if (!grouped[audit.tier]) {
        grouped[audit.tier] = [];
      }
      grouped[audit.tier].push(audit);
    });
    return grouped;
  }, [relatedAudits]);

  // Get list of completed tiers (those with at least one audit)
  const completedTiers = useMemo(() => Object.keys(auditsByTier), [auditsByTier]);

  // Get the current tier from the displayed data
  const currentTier = data.tier || 'shape';

  const [activeTier, setActiveTier] = useState<string>(currentTier);
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState<string | null>(null);
  const [upgradesDropdownOpen, setUpgradesDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [pendingDeepAuditTier, setPendingDeepAuditTier] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<ConnectProvider>('generic');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const upgradesButtonRef = useRef<HTMLButtonElement>(null);
  const tierButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Update active tier when data changes
  useEffect(() => {
    if (data.tier) {
      setActiveTier(data.tier);
    }
  }, [data.tier, data.auditId]);

  const handleTierClick = useCallback((tierId: string, buttonElement: HTMLButtonElement) => {
    // If clicking on the active tier, toggle history dropdown (always show for completed tiers)
    if (tierId === activeTier && auditsByTier[tierId]?.length > 0) {
      const rect = buttonElement.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
      setHistoryDropdownOpen(historyDropdownOpen === tierId ? null : tierId);
      setUpgradesDropdownOpen(false);
    } else if (auditsByTier[tierId]?.length > 0) {
      // Switch to the most recent audit of this tier
      const latestAudit = auditsByTier[tierId][0];
      onSelectAudit?.(latestAudit);
      setActiveTier(tierId);
      setHistoryDropdownOpen(null);
    }
  }, [activeTier, auditsByTier, onSelectAudit, historyDropdownOpen]);

  const handleUpgradesClick = useCallback(() => {
    if (!upgradesDropdownOpen && upgradesButtonRef.current) {
      const rect = upgradesButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      });
    }
    setUpgradesDropdownOpen(!upgradesDropdownOpen);
    setHistoryDropdownOpen(null);
  }, [upgradesDropdownOpen]);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleRunDeepAudit = useCallback((tierId: string, provider: string) => {
    setPendingDeepAuditTier(tierId);
    setPendingProvider(provider as ConnectProvider);
    setIsConnectModalOpen(true);
  }, []);

  const handleConnectSubmit = useCallback((config: any) => {
    if (onRunTier && pendingDeepAuditTier) {
      onRunTier(pendingDeepAuditTier as AuditTier, `https://github.com/${data.repoName}`, config);
    }
    setIsConnectModalOpen(false);
    setPendingDeepAuditTier(null);
  }, [onRunTier, pendingDeepAuditTier, data.repoName]);

  const handleExportCSV = useCallback(() => {
    const headers = ['ID', 'Title', 'Severity', 'Category', 'File Path', 'Line Number', 'Description'];
    const rows = data.issues.map(issue => [
      issue.id,
      `"${issue.title.replace(/"/g, '""')}"`,
      issue.severity,
      issue.category,
      issue.filePath,
      issue.lineNumber,
      `"${issue.description.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${data.repoName}_audit_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [data.issues, data.repoName]);

  const handleCopyIssues = useCallback(async () => {
    const issuesText = data.issues.map(issue =>
      `• ${issue.severity.toUpperCase()}: ${issue.title}\n  ${issue.description}\n  File: ${issue.filePath}${issue.lineNumber ? `:${issue.lineNumber}` : ''}\n`
    ).join('\n');

    try {
      await navigator.clipboard.writeText(issuesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy issues:', err);
    }
  }, [data.issues]);

  // Get tiers that haven't been run yet
  const uncompletedTiers = TIERS.filter(t => !completedTiers.includes(t.id));

  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  // Return individual values to prevent unnecessary re-renders
  // Components can now selectively subscribe to only the values they need
  return {
    // State
    activeTier,
    setActiveTier,
    historyDropdownOpen,
    setHistoryDropdownOpen,
    upgradesDropdownOpen,
    setUpgradesDropdownOpen,
    copied,
    dropdownPosition,
    setDropdownPosition,
    isConnectModalOpen,
    setIsConnectModalOpen,
    pendingDeepAuditTier,
    pendingProvider,

    // Computed values
    auditsByTier,
    completedTiers,
    uncompletedTiers,
    currentTier,

    // Refs
    dropdownRef,
    upgradesButtonRef,
    tierButtonRefs,

    // Handlers
    handleTierClick,
    handleUpgradesClick,
    handleShare,
    handleRunDeepAudit,
    handleConnectSubmit,
    handleExportCSV,
    handleCopyIssues,
    formatDate,
  };
};
