import React, { useCallback, useState, useEffect } from 'react';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Pricing from './components/pages/Pricing';
import About from './components/pages/About';
import Contact from './components/pages/Contact';
import Features from './components/pages/Features';
import Legal from './components/pages/Legal';
import Privacy from './components/pages/Privacy';
import Terms from './components/pages/Terms';
import AuthModal from './components/features/auth/AuthModal';
import SEO from './components/common/SEO';
import { AppProviders, useAuthContext, useRouterContext, useAuthFlowContext } from './components/layout/AppProviders';
import { LandingPage } from './components/pages/LandingPage';
import { AuditFlow } from './components/features/audit/AuditFlow';
import { DashboardPage } from './components/pages/DashboardPage';
import { DebugService } from './services/debugService';
import { fetchPreflight, PreflightRecord } from './services/preflightService';
import { AuditService } from './services/auditService';
import { usePreflightStore, useAuditStore, useScannerStore } from './stores';
import { supabase } from './src/integrations/supabase/client';
import { AuditStats, LogEntry, AuditRecord, RepoReport } from './types';

const AppContent: React.FC = () => {
  const { user, signOut, clearGitHubState } = useAuthContext();
  const { view, previousView, navigate, resetToLanding, isPublicPage, getSEO, setPreviousView } = useRouterContext();
  const { isAuthOpen, handleSoftStart, openAuthModal, closeAuthModal } = useAuthFlowContext();

  // Zustand stores for state management
  const repoUrl = usePreflightStore((state) => state.repoUrl) || '';
  const setRepoUrl = useCallback((url: string) => {
    usePreflightStore.getState().setRepoUrl(url);
  }, []);

  // Track active channel for cleanup (logs are now in Zustand store)
  const [activeChannel, setActiveChannel] = useState<any>(null);

  // Clean up active subscription on component unmount
  useEffect(() => {
    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [activeChannel]);

  // Handle analyze - navigate to preflight
  const handleAnalyze = useCallback((url: string) => {
    setRepoUrl(url);
    setPreviousView('landing');
    navigate('preflight');
  }, [setRepoUrl, setPreviousView, navigate]);

  // Handle soft start (auth flow version)
  const handleSoftStartWrapper = useCallback((url: string) => {
    if (user) {
      handleAnalyze(url);
    } else {
      handleSoftStart(url);
    }
  }, [user, handleAnalyze, handleSoftStart]);

  // Clear all audit state using Zustand stores
  const clearAuditState = useCallback(() => {
    usePreflightStore.getState().clear();
    useAuditStore.getState().clear();
    useScannerStore.getState().reset(); // This now also clears logs
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      setActiveChannel(null);
    }
  }, [activeChannel]);

  // Comprehensive logout handler
  const handleSignOut = async () => {
    if (import.meta.env.DEV) {
      console.log('📸 Pre-logout storage state:');
      DebugService.logStorageSnapshot('Before Logout');
    }

    try {
      await signOut();
      clearGitHubState();
      clearAuditState();
      resetToLanding();

      if (import.meta.env.DEV) {
        setTimeout(() => {
          DebugService.verifyCleanLogout();
          DebugService.auditStorageForSensitiveData();
        }, 100);
      }
    } catch (error) {
      console.error('Error during logout:', error);
      clearGitHubState();
      clearAuditState();
      resetToLanding();
    }
  };

  // Handle confirm audit - start the scan
  const handleConfirmAudit = useCallback(async (
    tier: string,
    stats: AuditStats,
    _fileMap: any[],
    preflightId?: string
  ) => {
    if (!preflightId) {
      console.error('[handleConfirmAudit] Missing preflight ID');
      return;
    }

    navigate('scanning');
    useScannerStore.getState().reset(); // This clears logs too
    useScannerStore.getState().setStatus('running');
    useAuditStore.getState().setAuditPhase('scan');
    usePreflightStore.getState().setPreflightId(preflightId);

    try {
      useScannerStore.getState().addLog({ message: `[System] Submitting audit job for ${tier}...`, timestamp: Date.now() });

      const { data: jobResponse, error: jobError } = await supabase.functions.invoke('audit-job-submit', {
        body: { preflightId, tier }
      });

      if (jobError) throw jobError;
      if (!jobResponse?.success && !jobResponse?.existingJobId) {
        throw new Error(jobResponse?.error || 'Failed to submit audit job');
      }

      const jobId = jobResponse?.jobId || jobResponse?.existingJobId;
      useScannerStore.getState().setActiveJobId(jobId);
      useScannerStore.getState().addLog({ message: `[System] Job ${jobResponse?.existingJobId ? 'resumed' : 'queued'}: ${jobId}`, timestamp: Date.now() });

      // Real-time subscription for progress
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
            useScannerStore.getState().setProgress(status.progress || 0);

            const transformedLogs = (status.logs || []).map((logStr: string) => {
              const match = logStr.match(/^\[([^\]]+)\]\s*(.+)$/);
              if (match) {
                return { timestamp: new Date(match[1]).getTime(), message: match[2] };
              }
              return { timestamp: Date.now(), message: logStr };
            });
            useScannerStore.getState().setLogs(transformedLogs);

            if (status.status === 'completed' && status.report_data) {
              useScannerStore.getState().addLog({ message: '[System] Audit completed successfully!', timestamp: Date.now() });

              const auditId = status.report_data.auditId;
              useAuditStore.getState().setActiveAuditId(auditId);
              useAuditStore.getState().setAuditPhase('complete');
              useScannerStore.getState().setStatus('completed');
              useScannerStore.getState().setProgress(100);

              // Fetch related audit IDs
              supabase
                .from('audit_complete_data')
                .select('id')
                .eq('repo_url', repoUrl)
                .order('created_at', { ascending: false })
                .then(({ data: related }) => {
                  const auditIds = (related || []).map((a: any) => a.id);
                  useAuditStore.getState().setAuditIds(auditIds);
                  setTimeout(() => navigate('report'), 1000);
                });

              supabase.removeChannel(channel);
              setActiveChannel(null);
            }

            if (status.status === 'failed') {
              useScannerStore.getState().addLog({ message: `[Error] Audit failed: ${status.error_message || 'Unknown error'}`, timestamp: Date.now() });
              useScannerStore.getState().setStatus('failed');
              supabase.removeChannel(channel);
              setActiveChannel(null);
              setTimeout(() => navigate('preflight'), 4000);
            }
          }
        )
        .subscribe();

      setActiveChannel(channel);

    } catch (error) {
      console.error('Orchestration Error:', error);
      useScannerStore.getState().addLog({ message: `[Error] Failed to start audit: ${error instanceof Error ? error.message : 'Unknown error'}`, timestamp: Date.now() });
      setTimeout(() => navigate('preflight'), 4000);
    }
  }, [navigate, repoUrl]);

  // Handle restart
  const handleRestart = useCallback(() => {
    navigate('landing');
    clearAuditState();
  }, [navigate, clearAuditState]);

  // Handle run tier from report
  const handleRunTier = useCallback(async (tier: string, url: string, config?: any) => {
    console.log('[handleRunTier] Called with:', { tier, url, config });

    if (!url || !url.includes('github.com')) {
      console.error('[handleRunTier] Invalid URL:', url);
      return;
    }

    setRepoUrl(url);

    try {
      const preflightResponse = await fetchPreflight(url);
      if (preflightResponse.success && preflightResponse.preflight) {
        const preflight = preflightResponse.preflight;
        usePreflightStore.getState().setPreflightId(preflight.id);
        await handleConfirmAudit(tier, preflight.stats, [], preflight.id);
        return;
      }
    } catch (error) {
      console.warn('Failed to check for existing preflight, falling back to modal:', error);
    }

    navigate('preflight');
  }, [setRepoUrl, navigate, handleConfirmAudit]);

  // Handle start audit from dashboard
  const handleStartAuditFromDashboard = useCallback(async (url: string, tier: string) => {
    setRepoUrl(url);
    navigate('preflight');
  }, [setRepoUrl, navigate]);

  // Handle cancel preflight
  const handleCancelPreflight = useCallback(() => {
    navigate(previousView);
  }, [navigate, previousView, view]);

  // Handle view historical report
  const handleViewHistoricalReport = useCallback(async (audit: any) => {
    // Validate that we have a repo URL
    if (!audit.repo_url) {
      console.error('[handleViewHistoricalReport] Audit missing repo_url:', audit.id);
      return;
    }

    useAuditStore.getState().setActiveAuditId(audit.id);
    setRepoUrl(audit.repo_url);

    // Set previousView to dashboard explicitly for historical report viewing
    // This ensures "Try Another Repo" goes back to dashboard, not previous report
    setPreviousView('dashboard');

    navigate('report');
  }, [setRepoUrl, navigate, setPreviousView]);

  const seoData = getSEO(null);

  const renderContent = () => {
    switch (view) {
      case 'landing':
        return (
          <LandingPage
            onAnalyze={handleAnalyze}
            onSoftStart={handleSoftStartWrapper}
          />
        );
      case 'preflight':
      case 'scanning':
      case 'report':
        return (
          <AuditFlow
            view={view}
            repoUrl={repoUrl}
            onConfirmAudit={handleConfirmAudit}
            onCancelPreflight={handleCancelPreflight}
            onRestart={handleRestart}
            onRunTier={handleRunTier}
          />
        );
      case 'pricing':
        return <Pricing />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
      case 'features':
        return <Features />;
      case 'legal':
        return <Legal onNavigate={navigate} />;
      case 'privacy':
        return <Privacy onNavigate={navigate} />;
      case 'terms':
        return <Terms onNavigate={navigate} />;
      case 'dashboard':
        return (
          <DashboardPage
            onNavigate={navigate}
            onViewReport={handleViewHistoricalReport}
            onStartAudit={handleStartAuditFromDashboard}
          />
        );
      default:
        return (
          <LandingPage
            onAnalyze={handleAnalyze}
            onSoftStart={handleSoftStartWrapper}
          />
        );
    }
  };

  return (
    <div className="bg-background min-h-screen text-foreground font-sans antialiased tracking-tight">
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
      />

      {isPublicPage && (
        <Navbar
          currentView={view}
          onNavigate={navigate}
          onSignInClick={openAuthModal}
          user={user}
          onSignOut={handleSignOut}
        />
      )}

      {renderContent()}

      {isPublicPage && <Footer onNavigate={navigate} />}

      <AuthModal
        isOpen={isAuthOpen}
        onClose={closeAuthModal}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
};

export default App;