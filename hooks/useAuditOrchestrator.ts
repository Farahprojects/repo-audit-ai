import { useState, useEffect, useCallback } from 'react';
import { ViewState, AuditStats, RepoReport, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { AuditService } from '../services/auditService';
import { ErrorHandler, ErrorLogger } from '../services/errorService';

interface UseAuditOrchestratorProps {
  user: any;
  navigate: (view: ViewState) => void;
  setPreviousView: (view: ViewState) => void;
}

export const useAuditOrchestrator = ({
  user,
  navigate,
  setPreviousView,
}: UseAuditOrchestratorProps) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [reportData, setReportData] = useState<RepoReport | null>(null);
  const [historicalReportData, setHistoricalReportData] = useState<RepoReport | null>(null);
  const [relatedAudits, setRelatedAudits] = useState<AuditRecord[]>([]);
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string | null>(null);

  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);

  const addLog = useCallback((msg: string) => setScannerLogs(prev => [...prev, msg]), []);

  // Clear all audit state (used on logout)
  const clearAuditState = useCallback(() => {
    setRepoUrl('');
    setAuditStats(null);
    setReportData(null);
    setHistoricalReportData(null);
    setRelatedAudits([]);
    setPendingRepoUrl(null);
    setScannerLogs([]);
    setScannerProgress(0);
  }, []);

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
    if (user) {
      handleAnalyze(url);
    } else {
      localStorage.setItem('pendingRepoUrl', url);
      setPendingRepoUrl(url);
    }
  }, [user, handleAnalyze]);

  /**
   * Handle confirmed audit - preflightId is the ONLY source of truth
   * 
   * The backend fetches everything from the preflights table:
   * - File map (repo_map)
   * - GitHub token (via github_account_id if is_private=true)
   * - Stats and fingerprint
   */
  const handleConfirmAudit = useCallback(async (
    tier: string,
    stats: AuditStats,
    _fileMap: any[], // Ignored - backend fetches from preflight
    preflightId?: string
  ) => {
    if (!preflightId) {
      ErrorLogger.error('Missing preflightId', new Error('preflightId is required'), { repoUrl, tier });
      addLog('[Error] Missing preflight ID. Please retry.');
      return;
    }

    ErrorLogger.info('Starting audit execution', { repoUrl, tier, preflightId });
    setAuditStats(stats);
    navigate('scanning');
    setScannerLogs([]);
    setScannerProgress(0);

    try {
      const result = await ErrorHandler.withErrorHandling(
        () => AuditService.executeAudit(
          repoUrl,
          tier,
          stats,
          preflightId, // Single source of truth
          addLog,
          setScannerProgress
        ),
        'executeAudit',
        { repoUrl, tier, preflightId }
      );

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
      ErrorLogger.error('Audit execution failed', error, { repoUrl, tier, preflightId });

      addLog(`[Error] Audit Failed: ${errorMessage}`);
      addLog(`[System] Terminating process.`);

      // Navigate back to preflight on error
      setTimeout(() => navigate('preflight'), 2000);
    }
  }, [repoUrl, addLog, navigate]);

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

  const handleSelectAudit = useCallback((audit: AuditRecord) => {
    const report = AuditService.processSelectedAudit(audit);
    setHistoricalReportData(report);
  }, []);

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
    scannerLogs,
    scannerProgress,

    // Handlers
    handleAnalyze,
    handleSoftStart,
    handleConfirmAudit,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    clearAuditState,
  };
};
