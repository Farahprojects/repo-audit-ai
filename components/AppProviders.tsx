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
  clearGitHubState: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

// Router Context
interface RouterContextType {
  view: ViewState;
  previousView: ViewState;
  navigate: (view: ViewState) => void;
  resetToLanding: () => void;
  isPublicPage: boolean;
  getSEO: (reportData?: RepoReport | null) => { title: string; description: string; keywords: string };
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const useRouterContext = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouterContext must be used within a RouterProvider');
  }
  return context;
};

// Scanner Context (Volatile - frequently changing)
interface ScannerContextType {
  scannerLogs: string[];
  scannerProgress: number;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export const useScannerContext = () => {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScannerContext must be used within a ScannerProvider');
  }
  return context;
};

// Audit Context (Stable - infrequently changing)
interface AuditContextType {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  auditStats: AuditStats | null;
  reportData: RepoReport | null;
  historicalReportData: RepoReport | null;
  relatedAudits: AuditRecord[];
  pendingRepoUrl: string | null;
  setPendingRepoUrl: (url: string | null) => void;
  handleAnalyze: (url: string) => void;
  handleConfirmAudit: (tier: string, stats: AuditStats) => Promise<void>;
  handleRestart: () => void;
  handleViewHistoricalReport: (audit: any) => Promise<void>;
  handleSelectAudit: (audit: AuditRecord) => void;
  clearAuditState: () => void;
}

const AuditContext = createContext<AuditContextType | undefined>(undefined);

export const useAuditContext = () => {
  const context = useContext(AuditContext);
  if (!context) {
    throw new Error('useAuditContext must be used within an AuditProvider');
  }
  return context;
};

// Auth Flow Context
interface AuthFlowContextType {
  isAuthOpen: boolean;
  handleSoftStart: (url: string) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthFlowContext = createContext<AuthFlowContextType | undefined>(undefined);

export const useAuthFlowContext = () => {
  const context = useContext(AuthFlowContext);
  if (!context) {
    throw new Error('useAuthFlowContext must be used within an AuthFlowProvider');
  }
  return context;
};

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  // Auth hook
  const auth = useAuth();

  // Router hook
  const router = useAppRouter();

  // GitHub auth hook (only for clearGitHubState now)
  const { clearGitHubState } = useGitHubAuth();

  // Audit orchestrator hook - no longer needs getGitHubToken (server-side now)
  const auditOrchestrator = useAuditOrchestrator({
    user: auth.user,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Auth flow hook
  const authFlow = useAuthFlow({
    user: auth.user,
    view: router.view,
    pendingRepoUrl: auditOrchestrator.pendingRepoUrl,
    setPendingRepoUrl: auditOrchestrator.setPendingRepoUrl,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Memoize individual context values to prevent unnecessary re-renders
  const authValue = useMemo(() => ({
    user: auth.user,
    session: auth.session,
    loading: auth.loading,
    signOut: auth.signOut,
    clearGitHubState,
  }), [auth.user, auth.session, auth.loading, auth.signOut, clearGitHubState]);

  const routerValue = useMemo(() => ({
    view: router.view,
    previousView: router.previousView,
    navigate: router.navigate,
    resetToLanding: router.resetToLanding,
    isPublicPage: router.isPublicPage,
    getSEO: router.getSEO,
  }), [router.view, router.previousView, router.navigate, router.resetToLanding, router.isPublicPage, router.getSEO]);

  // Stable audit context - infrequently changing values
  const auditValue = useMemo(() => ({
    repoUrl: auditOrchestrator.repoUrl,
    setRepoUrl: auditOrchestrator.setRepoUrl,
    auditStats: auditOrchestrator.auditStats,
    reportData: auditOrchestrator.reportData,
    historicalReportData: auditOrchestrator.historicalReportData,
    relatedAudits: auditOrchestrator.relatedAudits,
    pendingRepoUrl: auditOrchestrator.pendingRepoUrl,
    setPendingRepoUrl: auditOrchestrator.setPendingRepoUrl,
    handleAnalyze: auditOrchestrator.handleAnalyze,
    handleConfirmAudit: auditOrchestrator.handleConfirmAudit,
    handleRestart: auditOrchestrator.handleRestart,
    handleViewHistoricalReport: auditOrchestrator.handleViewHistoricalReport,
    handleSelectAudit: auditOrchestrator.handleSelectAudit,
    clearAuditState: auditOrchestrator.clearAuditState,
  }), [
    auditOrchestrator.repoUrl,
    auditOrchestrator.setRepoUrl,
    auditOrchestrator.auditStats,
    auditOrchestrator.reportData,
    auditOrchestrator.historicalReportData,
    auditOrchestrator.relatedAudits,
    auditOrchestrator.pendingRepoUrl,
    auditOrchestrator.setPendingRepoUrl,
    auditOrchestrator.handleAnalyze,
    auditOrchestrator.handleConfirmAudit,
    auditOrchestrator.handleRestart,
    auditOrchestrator.handleViewHistoricalReport,
    auditOrchestrator.handleSelectAudit,
    auditOrchestrator.clearAuditState,
  ]);

  // Volatile scanner context - frequently changing values
  const scannerValue = useMemo(() => ({
    scannerLogs: auditOrchestrator.scannerLogs,
    scannerProgress: auditOrchestrator.scannerProgress,
  }), [
    auditOrchestrator.scannerLogs,
    auditOrchestrator.scannerProgress,
  ]);

  const authFlowValue = useMemo(() => ({
    isAuthOpen: authFlow.isAuthOpen,
    handleSoftStart: authFlow.handleSoftStart,
    openAuthModal: authFlow.openAuthModal,
    closeAuthModal: authFlow.closeAuthModal,
  }), [authFlow.isAuthOpen, authFlow.handleSoftStart, authFlow.openAuthModal, authFlow.closeAuthModal]);

  return (
    <AuthContext.Provider value={authValue}>
      <RouterContext.Provider value={routerValue}>
        <AuditContext.Provider value={auditValue}>
          <ScannerContext.Provider value={scannerValue}>
            <AuthFlowContext.Provider value={authFlowValue}>
              {children}
            </AuthFlowContext.Provider>
          </ScannerContext.Provider>
        </AuditContext.Provider>
      </RouterContext.Provider>
    </AuthContext.Provider>
  );
};
