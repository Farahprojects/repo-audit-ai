import { useState, useEffect, useMemo, useCallback } from 'react';
import { ViewState, AuditStats, RepoReport, Issue, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { AuditService } from '../services/auditService';
import { ErrorHandler, ErrorLogger } from '../services/errorService';
import { FileMapItem } from '../services/githubService';

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
  const [fileMap, setFileMap] = useState<FileMapItem[]>([]);
  const [reportData, setReportData] = useState<RepoReport | null>(null);
  const [historicalReportData, setHistoricalReportData] = useState<RepoReport | null>(null);
  const [relatedAudits, setRelatedAudits] = useState<AuditRecord[]>([]);
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string | null>(null);
  const [auditConfig, setAuditConfig] = useState<any>(null);

  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);

  const addLog = useCallback((msg: string) => setScannerLogs(prev => [...prev, msg]), []);

  // Restore pending repo URL from localStorage on app load
  useEffect(() => {
    const stored = localStorage.getItem('pendingRepoUrl');
    if (stored) {
      setPendingRepoUrl(stored);
      localStorage.removeItem('pendingRepoUrl');
    }
  }, []);

  const handleAnalyze = useCallback((url: string) => {
    setRepoUrl(url);
    setPreviousView('landing');
    navigate('preflight');
  }, [navigate, setPreviousView]);

  const handleSoftStart = useCallback((url: string) => {
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
  }, [user, handleAnalyze]);

  const handleConfirmAudit = useCallback(async (tier: string, stats: AuditStats, fileMapParam: FileMapItem[], preflightId?: string) => {
    ErrorLogger.info('Starting audit execution', { repoUrl, tier, statsSize: stats.files, fileCount: fileMapParam.length, hasPreflightId: !!preflightId });
    setAuditStats(stats);
    setFileMap(fileMapParam);
    navigate('scanning');
    setScannerLogs([]);
    setScannerProgress(0);

    try {
      const result = await ErrorHandler.withErrorHandling(
        () => AuditService.executeAudit(
          repoUrl,
          tier,
          stats,
          fileMapParam, // Pass the fileMap instead of refetching
          auditConfig,
          getGitHubToken,
          addLog,
          setScannerProgress,
          preflightId // Pass preflightId to use stored preflight data
        ),
        'executeAudit',
        { repoUrl, tier, stats, fileCount: fileMapParam.length, preflightId }
      );

      // Clear config
      setAuditConfig(null);

      ErrorLogger.info('Audit completed successfully', {
        repoUrl,
        tier,
        issuesFound: result.report.issues.length,
        healthScore: result.report.healthScore
      });

      setReportData(result.report);
      setRelatedAudits(result.relatedAudits);

      // Short delay to let user see 100%
      setTimeout(() => navigate('report'), 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown audit error';
      ErrorLogger.error('Audit execution failed', error, { repoUrl, tier, stats });

      addLog(`[Error] Audit Failed: ${errorMessage}`);
      addLog(`[System] Terminating process.`);

      // Navigate back to preflight on error
      setTimeout(() => navigate('preflight'), 2000);
    }
  }, [repoUrl, auditConfig, getGitHubToken, addLog, navigate]);

  const handleRestart = useCallback(() => {
    navigate('landing');
    setRepoUrl('');
    setReportData(null);
    setHistoricalReportData(null);
    setAuditStats(null);
    setScannerLogs([]);
    setScannerProgress(0);
  }, [navigate]);

  const handleViewHistoricalReport = useCallback(async (audit: Tables<'audits'> & { extra_data?: any }) => {
    const result = await AuditService.processHistoricalAudit(audit);
    setRelatedAudits(result.relatedAudits);
    setHistoricalReportData(result.report);
    navigate('report');
  }, [navigate]);

  // Handle switching to a different audit from history dropdown
  const handleSelectAudit = useCallback((audit: AuditRecord) => {
    const report = AuditService.processSelectedAudit(audit);
    setHistoricalReportData(report);
  }, []);

  // Return individual values to prevent unnecessary re-renders
  // Components can now selectively subscribe to only the values they need
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
