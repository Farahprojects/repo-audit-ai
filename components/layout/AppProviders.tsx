import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAppRouter } from '../../hooks/useAppRouter';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { useAuthFlow } from '../../hooks/useAuthFlow';
import { User, Session } from '@supabase/supabase-js';
import { ViewState, RepoReport, LogEntry } from '../../types';
import { usePreflightStore, useAuditStore, useScannerStore } from '../../stores';
import { supabase } from '../../src/integrations/supabase/client';

// Auth Context
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  clearGitHubState: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Named export for better Fast Refresh compatibility
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

// Router Context
interface RouterContextType {
  view: ViewState;
  previousView: ViewState;
  navigate: (view: ViewState) => void;
  setPreviousView: (view: ViewState) => void;
  resetToLanding: () => void;
  isPublicPage: boolean;
  getSEO: (reportData?: RepoReport | null) => { title: string; description: string; keywords: string };
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

// Named export for better Fast Refresh compatibility
export function useRouterContext() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouterContext must be used within a RouterProvider');
  }
  return context;
}

// Scanner Context - Now backed by Zustand store + real-time logs
interface ScannerContextType {
  scannerLogs: LogEntry[];
  scannerProgress: number;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

// Named export for better Fast Refresh compatibility
export function useScannerContext() {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScannerContext must be used within a ScannerProvider');
  }
  return context;
}

// Auth Flow Context
interface AuthFlowContextType {
  isAuthOpen: boolean;
  handleSoftStart: (url: string) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthFlowContext = createContext<AuthFlowContextType | undefined>(undefined);

// Named export for better Fast Refresh compatibility
export function useAuthFlowContext() {
  const context = useContext(AuthFlowContext);
  if (!context) {
    throw new Error('useAuthFlowContext must be used within an AuthFlowProvider');
  }
  return context;
}

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

  // Scanner logs - managed locally, synced from real-time updates
  const [scannerLogs, setScannerLogs] = useState<LogEntry[]>([]);
  const scannerProgress = useScannerStore((state) => state.progress);
  const preflightId = usePreflightStore((state) => state.preflightId);

  // Real-time subscription for scanner logs
  useEffect(() => {
    if (!preflightId) return;

    const channel = supabase
      .channel(`scanner-${preflightId}`)
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
          useScannerStore.getState().setProgress(status.progress || 0);

          // Transform backend logs to frontend format
          const transformedLogs = (status.logs || []).map((logStr: string) => {
            const match = logStr.match(/^\[([^\]]+)\]\s*(.+)$/);
            if (match) {
              return { timestamp: new Date(match[1]).getTime(), message: match[2] };
            }
            return { timestamp: Date.now(), message: logStr };
          });
          setScannerLogs(transformedLogs);

          // Handle completion
          if (status.status === 'completed') {
            useScannerStore.getState().setStatus('completed');
            if (status.report_data?.auditId) {
              useAuditStore.getState().setActiveAuditId(status.report_data.auditId);
              useAuditStore.getState().setAuditPhase('complete');
            }
          }

          if (status.status === 'failed') {
            useScannerStore.getState().setStatus('failed');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [preflightId]);

  // Pending repo URL for auth flow - now using Zustand
  const pendingRepoUrl = usePreflightStore((state) => state.repoUrl);
  const setPendingRepoUrl = useCallback((url: string | null) => {
    usePreflightStore.getState().setRepoUrl(url);
  }, []);

  // Auth flow hook
  const authFlow = useAuthFlow({
    user: auth.user,
    view: router.view,
    pendingRepoUrl,
    setPendingRepoUrl,
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
    setPreviousView: router.setPreviousView,
    resetToLanding: router.resetToLanding,
    isPublicPage: router.isPublicPage,
    getSEO: router.getSEO,
  }), [router.view, router.previousView, router.navigate, router.setPreviousView, router.resetToLanding, router.isPublicPage, router.getSEO]);

  // Scanner context value - now from Zustand + local logs
  const scannerValue = useMemo(() => ({
    scannerLogs,
    scannerProgress,
  }), [scannerLogs, scannerProgress]);

  const authFlowValue = useMemo(() => ({
    isAuthOpen: authFlow.isAuthOpen,
    handleSoftStart: authFlow.handleSoftStart,
    openAuthModal: authFlow.openAuthModal,
    closeAuthModal: authFlow.closeAuthModal,
  }), [authFlow.isAuthOpen, authFlow.handleSoftStart, authFlow.openAuthModal, authFlow.closeAuthModal]);

  return (
    <AuthContext.Provider value={authValue}>
      <RouterContext.Provider value={routerValue}>
        <ScannerContext.Provider value={scannerValue}>
          <AuthFlowContext.Provider value={authFlowValue}>
            {children}
          </AuthFlowContext.Provider>
        </ScannerContext.Provider>
      </RouterContext.Provider>
    </AuthContext.Provider>
  );
};

// Stable component identity for Fast Refresh
AppProviders.displayName = 'AppProviders';
