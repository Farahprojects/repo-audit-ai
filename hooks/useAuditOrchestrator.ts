import { useState, useEffect } from 'react';
import { ViewState, AuditStats, RepoReport, Issue, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { AuditService } from '../services/auditService';

interface UseAuditOrchestratorProps {
  user: any;
  getGitHubToken: () => Promise<string | undefined>;
  navigate: (view: ViewState) => void;
  setPreviousView: (view: ViewState) => void;
}

export const useAuditOrchestrator = ({
  user,
  getGitHubToken,
  navigate,
  setPreviousView,
}: UseAuditOrchestratorProps) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [reportData, setReportData] = useState<RepoReport | null>(null);
  const [historicalReportData, setHistoricalReportData] = useState<RepoReport | null>(null);
  const [relatedAudits, setRelatedAudits] = useState<AuditRecord[]>([]);
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string | null>(null);
  const [auditConfig, setAuditConfig] = useState<any>(null);

  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);

  const addLog = (msg: string) => setScannerLogs(prev => [...prev, msg]);

  // Restore pending repo URL from localStorage on app load
  useEffect(() => {
    const stored = localStorage.getItem('pendingRepoUrl');
    if (stored) {
      setPendingRepoUrl(stored);
      localStorage.removeItem('pendingRepoUrl');
    }
  }, []);

  const handleAnalyze = (url: string) => {
    setRepoUrl(url);
    setPreviousView('landing');
    navigate('preflight');
  };

  const handleSoftStart = (url: string) => {
    // Check if user is authenticated
    if (user) {
      // If authenticated, start audit immediately
      handleAnalyze(url);
    } else {
      // If not authenticated, store URL and show sign-in
      localStorage.setItem('pendingRepoUrl', url);
      setPendingRepoUrl(url);
      // Note: Auth modal handling should be in auth flow hook
    }
  };

  const handleConfirmAudit = async (tier: string, stats: AuditStats) => {
    setAuditStats(stats);
    navigate('scanning');
    setScannerLogs([]);
    setScannerProgress(0);

    try {
      const result = await AuditService.executeAudit(
        repoUrl,
        tier,
        stats,
        auditConfig,
        getGitHubToken,
        addLog,
        setScannerProgress
      );

      // Clear config
      setAuditConfig(null);

      setReportData(result.report);
      setRelatedAudits(result.relatedAudits);

      // Short delay to let user see 100%
      setTimeout(() => navigate('report'), 1000);

    } catch (e: any) {
      addLog(`[Error] Audit Failed: ${e.message}`);
      addLog(`[System] Terminating process.`);
      console.error("Failed to generate report", e);
    }
  };

  const handleRestart = () => {
    navigate('landing');
    setRepoUrl('');
    setReportData(null);
    setHistoricalReportData(null);
    setAuditStats(null);
    setScannerLogs([]);
    setScannerProgress(0);
  };

  const handleViewHistoricalReport = async (audit: Tables<'audits'> & { extra_data?: any }) => {
    const result = await AuditService.processHistoricalAudit(audit);
    setRelatedAudits(result.relatedAudits);
    setHistoricalReportData(result.report);
    navigate('report');
  };

  // Handle switching to a different audit from history dropdown
  const handleSelectAudit = (audit: AuditRecord) => {
    const report = AuditService.processSelectedAudit(audit);
    setHistoricalReportData(report);
  };

  return {
    // State
    repoUrl,
    setRepoUrl,
    auditStats,
    reportData,
    historicalReportData,
    relatedAudits,
    pendingRepoUrl,
    setPendingRepoUrl,
    auditConfig,
    setAuditConfig,
    scannerLogs,
    scannerProgress,

    // Handlers
    handleAnalyze,
    handleSoftStart,
    handleConfirmAudit,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
  };
};
