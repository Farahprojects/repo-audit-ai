import { useState, useEffect, useCallback } from 'react';
import { ViewState, AuditStats, RepoReport, AuditRecord } from '../types';
import { Tables } from '../src/integrations/supabase/types';
import { AuditService } from '../services/auditService';
import { ErrorHandler, ErrorLogger } from '../services/errorService';
import { PreflightRecord } from '../services/preflightService';
import { supabase } from '../src/integrations/supabase/client';

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
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);

  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);
  const [activeChannel, setActiveChannel] = useState<any>(null);

  const addLog = useCallback((msg: string) => setScannerLogs(prev => [...prev, msg]), []);

  // Clean up real-time subscriptions on unmount
  useEffect(() => {
    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
        setActiveChannel(null);
      }
    };
  }, [activeChannel]);

  // Clear all audit state (used on logout)
  const clearAuditState = useCallback(() => {
    setRepoUrl('');
    setAuditStats(null);
    setReportData(null);
    setHistoricalReportData(null);
    setRelatedAudits([]);
    setPendingRepoUrl(null);
    setActiveAuditId(null);
    setScannerLogs([]);
    setScannerProgress(0);

    // Clean up any active real-time subscriptions
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      setActiveChannel(null);
    }
  }, [activeChannel]);

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

  // Server-side Queue-based Orchestration with Real-time Updates
  const runOrchestratedAudit = useCallback(async (
    url: string,
    tier: string,
    preflightId: string,
    stats: AuditStats
  ) => {
    navigate('scanning');
    setScannerLogs([]);
    setScannerProgress(0);
    setAuditStats(stats);

    try {
      addLog(`[System] Submitting audit job for ${tier}...`);

      // Submit job to the queue (returns immediately)
      const { data: jobResponse, error: jobError } = await supabase.functions.invoke('audit-job-submit', {
        body: {
          preflightId,
          tier
        }
      });

      if (jobError) {
        throw jobError;
      }

      if (!jobResponse?.success) {
        throw new Error(jobResponse?.error || 'Failed to submit audit job');
      }

      addLog(`[System] Job queued: ${jobResponse.jobId}`);
      addLog(`[System] Tracking progress in real-time...`);

      // Set up real-time subscription for progress updates
      const channel = supabase
        .channel(`audit-${preflightId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'audit_status',
            filter: `preflight_id=eq.${preflightId}`
          },
          (payload) => {
            const status = payload.new;

            // Update progress and logs
            setScannerProgress(status.progress || 0);
            setScannerLogs(status.logs || []);

            // Handle completion
            if (status.status === 'completed' && status.report_data) {
              addLog(`[System] Audit completed successfully!`);

              // Fetch related audits for navigation
              supabase
                .from('audits')
                .select('id, repo_url, tier, health_score, summary, created_at, issues, extra_data')
                .eq('repo_url', url)
                .order('created_at', { ascending: false })
                .then(({ data: related }) => {
                  setReportData(status.report_data);
                  setActiveAuditId(status.report_data.auditId);  // Fresh audit is now active
                  setRelatedAudits((related || []) as unknown as AuditRecord[]);
                  setTimeout(() => navigate('report'), 1000);
                });

              // Clean up subscription
              supabase.removeChannel(channel);
              setActiveChannel(null);
            }

            // Handle failure
            if (status.status === 'failed') {
              addLog(`[Error] Audit failed: ${status.error_message || 'Unknown error'}`);
              ErrorLogger.error('Server-side Audit Failed', new Error(status.error_message), {
                preflightId,
                errorDetails: status.error_details
              });

              // Clean up subscription
              supabase.removeChannel(channel);
              setActiveChannel(null);
              setTimeout(() => navigate('preflight'), 4000);
            }
          }
        )
        .subscribe();

      // Store channel reference for cleanup
      setActiveChannel(channel);

      // Fallback timeout in case real-time updates fail
      setTimeout(() => {
        if (scannerProgress < 100) {
          addLog(`[Warning] Real-time updates may be delayed. Please wait...`);
        }
      }, 10000);

    } catch (error) {
      console.error('Orchestration Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`[Error] Failed to start audit: ${errorMessage}`);
      ErrorLogger.error('Audit Orchestration Start Failed', error instanceof Error ? error : new Error('Unknown error'), { url, tier, preflightId });

      setTimeout(() => navigate('preflight'), 4000);
    }
  }, [addLog, navigate, user?.id, scannerProgress]);

  const handleConfirmAudit = useCallback(async (
    tier: string,
    stats: AuditStats,
    _fileMap: any[],
    preflightId?: string
  ) => {
    if (!preflightId) {
      addLog('[Error] Missing preflight ID.');
      return;
    }
    await runOrchestratedAudit(repoUrl, tier, preflightId, stats);
  }, [repoUrl, addLog, runOrchestratedAudit]);

  const handleStartAuditWithPreflight = useCallback(async (
    url: string,
    tier: string,
    preflight: PreflightRecord
  ) => {
    setRepoUrl(url);
    await runOrchestratedAudit(url, tier, preflight.id, preflight.stats);
  }, [runOrchestratedAudit]);

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
    setActiveAuditId(audit.id);  // Track explicit selection
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
    activeAuditId,
    scannerLogs,
    scannerProgress,

    // Handlers
    handleAnalyze,
    handleSoftStart,
    handleConfirmAudit,
    handleStartAuditWithPreflight,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    clearAuditState,
  };
};
