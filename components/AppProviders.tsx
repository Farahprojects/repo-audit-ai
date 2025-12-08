import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAppRouter } from '../hooks/useAppRouter';
import { useAuditOrchestrator } from '../hooks/useAuditOrchestrator';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import { useAuthFlow } from '../hooks/useAuthFlow';
import { User, Session } from '@supabase/supabase-js';
import { ViewState, RepoReport, AuditStats, AuditRecord } from '../types';

// Auth Context
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

// Report Context
interface ReportContextType {
  // Router state and functions
  view: ViewState;
  previousView: ViewState;
  navigate: (view: ViewState) => void;
  isPublicPage: boolean;
  getSEO: (reportData?: RepoReport | null) => { title: string; description: string; keywords: string };

  // Audit orchestrator state and functions
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  auditStats: AuditStats | null;
  reportData: RepoReport | null;
  historicalReportData: RepoReport | null;
  relatedAudits: AuditRecord[];
  pendingRepoUrl: string | null;
  setPendingRepoUrl: (url: string | null) => void;
  scannerLogs: string[];
  scannerProgress: number;
  handleAnalyze: (url: string) => void;
  handleConfirmAudit: (tier: string, stats: AuditStats) => Promise<void>;
  handleRestart: () => void;
  handleViewHistoricalReport: (audit: any) => Promise<void>;
  handleSelectAudit: (audit: AuditRecord) => void;

  // Auth flow state and functions
  isAuthOpen: boolean;
  handleSoftStart: (url: string) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export const useReportContext = () => {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error('useReportContext must be used within a ReportProvider');
  }
  return context;
};

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  // Auth hook - returns new object on every render, so we memoize the value
  const auth = useAuth();

  // Memoize auth context value to prevent re-renders
  const authValue = useMemo(() => auth, [auth.user, auth.session, auth.loading]);

  // Router hook - returns new object on every render, so we memoize the value
  const router = useAppRouter();

  // GitHub auth hook
  const { getGitHubToken } = useGitHubAuth();

  // Audit orchestrator hook - returns new object on every render, so we memoize the value
  const auditOrchestrator = useAuditOrchestrator({
    user: auth.user,
    getGitHubToken,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Auth flow hook - returns new object on every render, so we memoize the value
  const authFlow = useAuthFlow({
    user: auth.user,
    view: router.view,
    pendingRepoUrl: auditOrchestrator.pendingRepoUrl,
    setPendingRepoUrl: auditOrchestrator.setPendingRepoUrl,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Memoize report context value to prevent re-renders
  const reportValue = useMemo(() => ({
    // Router
    view: router.view,
    previousView: router.previousView,
    navigate: router.navigate,
    isPublicPage: router.isPublicPage,
    getSEO: router.getSEO,

    // Audit orchestrator
    repoUrl: auditOrchestrator.repoUrl,
    setRepoUrl: auditOrchestrator.setRepoUrl,
    auditStats: auditOrchestrator.auditStats,
    reportData: auditOrchestrator.reportData,
    historicalReportData: auditOrchestrator.historicalReportData,
    relatedAudits: auditOrchestrator.relatedAudits,
    pendingRepoUrl: auditOrchestrator.pendingRepoUrl,
    setPendingRepoUrl: auditOrchestrator.setPendingRepoUrl,
    scannerLogs: auditOrchestrator.scannerLogs,
    scannerProgress: auditOrchestrator.scannerProgress,
    handleAnalyze: auditOrchestrator.handleAnalyze,
    handleConfirmAudit: auditOrchestrator.handleConfirmAudit,
    handleRestart: auditOrchestrator.handleRestart,
    handleViewHistoricalReport: auditOrchestrator.handleViewHistoricalReport,
    handleSelectAudit: auditOrchestrator.handleSelectAudit,

    // Auth flow
    isAuthOpen: authFlow.isAuthOpen,
    handleSoftStart: authFlow.handleSoftStart,
    openAuthModal: authFlow.openAuthModal,
    closeAuthModal: authFlow.closeAuthModal,
  }), [
    router.view,
    router.previousView,
    router.navigate,
    router.isPublicPage,
    router.getSEO,
    auditOrchestrator.repoUrl,
    auditOrchestrator.setRepoUrl,
    auditOrchestrator.auditStats,
    auditOrchestrator.reportData,
    auditOrchestrator.historicalReportData,
    auditOrchestrator.relatedAudits,
    auditOrchestrator.pendingRepoUrl,
    auditOrchestrator.setPendingRepoUrl,
    auditOrchestrator.scannerLogs,
    auditOrchestrator.scannerProgress,
    auditOrchestrator.handleAnalyze,
    auditOrchestrator.handleConfirmAudit,
    auditOrchestrator.handleRestart,
    auditOrchestrator.handleViewHistoricalReport,
    auditOrchestrator.handleSelectAudit,
    authFlow.isAuthOpen,
    authFlow.handleSoftStart,
    authFlow.openAuthModal,
    authFlow.closeAuthModal,
  ]);

  return (
    <AuthContext.Provider value={authValue}>
      <ReportContext.Provider value={reportValue}>
        {children}
      </ReportContext.Provider>
    </AuthContext.Provider>
  );
};
