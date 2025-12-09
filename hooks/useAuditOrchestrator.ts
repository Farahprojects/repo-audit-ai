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

  // Shared Orchestration Logic
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
      // Phase 1: Planning
      addLog(`[System] Starting audit orchestration for ${tier}...`);
      addLog(`[Planner] Analyzing codebase structure...`);
      setScannerProgress(2);

      addLog(`[Planner] Loading audit requirements...`);
      setScannerProgress(4);

      addLog(`[Planner] Generating specialized task breakdown...`);
      setScannerProgress(5);

      const { plan, usage: plannerUsage, preflight } = await AuditService.planAudit(preflightId, tier);

      addLog(`[Planner] Plan generated: ${plan.tasks.length} tasks.`);
      addLog(`[Planner] Focus: ${plan.focusArea || 'General Audit'}`);
      setScannerProgress(15);

      // Phase 2: Execution (Workers)
      const workerResults = [];
      const totalTasks = plan.tasks.length;
      let completedTasks = 0;

      // Run tasks in parallel, passing preflight data to avoid N+1 DB queries
      const taskPromises = plan.tasks.map(async (task: any, index: number) => {
        try {
          addLog(`[Worker ${index + 1}] Starting: ${task.role}`);
          const { result } = await AuditService.runAuditTask(preflightId, task, preflight);

          addLog(`[Worker ${index + 1}] Finished: Found ${result.issues?.length || 0} issues.`);
          completedTasks++;
          // Rough progress mapping: 15% -> 85%
          const progress = 15 + Math.round((completedTasks / totalTasks) * 70);
          setScannerProgress(progress);

          return result;
        } catch (err) {
          console.error(`Worker ${index + 1} failed:`, err);
          addLog(`[Worker ${index + 1}] Failed to complete task.`);
          // Return valid structure so synthesis doesn't crash
          return {
            taskId: task.id,
            findings: { error: "Worker Failed", message: String(err) },
            tokenUsage: 0
          };
        }
      });

      const results = await Promise.all(taskPromises);
      workerResults.push(...results);

      addLog(`[System] All workers completed.`);
      setScannerProgress(90);

      // Phase 3: Synthesis
      addLog(`[Coordinator] Synthesizing results...`);
      const finalReport = await AuditService.synthesizeAuditResults(preflightId, workerResults, tier, plannerUsage);

      addLog(`[Coordinator] Synthesis complete. Found ${finalReport.issues?.length || 0} issues. Health Score: ${finalReport.healthScore}`);
      setScannerProgress(100);

      // Fetch related audits for navigation
      const { data: related } = await supabase
        .from('audits')
        .select('id, repo_url, tier, health_score, summary, created_at, issues, extra_data')
        .eq('repo_url', url)
        .order('created_at', { ascending: false });

      setReportData(finalReport);
      setRelatedAudits((related || []) as unknown as AuditRecord[]);

      setTimeout(() => navigate('report'), 1000);

    } catch (error) {
      console.error('Orchestration Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`[Error] Audit Failed: ${errorMessage}`);
      ErrorLogger.error('Audit Orchestration Failed', error, { url, tier, preflightId });

      // Don't navigate away immediately so user can see error
      setTimeout(() => navigate('preflight'), 4000);
    }
  }, [addLog, navigate]);

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
    handleStartAuditWithPreflight,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    clearAuditState,
  };
};
