import React, { useCallback } from 'react';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Pricing from './components/pages/Pricing';
import About from './components/pages/About';
import Contact from './components/pages/Contact';
import Legal from './components/pages/Legal';
import Privacy from './components/pages/Privacy';
import Terms from './components/pages/Terms';
import AuthModal from './components/features/auth/AuthModal';
import SEO from './components/common/SEO';
import { AppProviders, useAuthContext, useRouterContext, useAuditContext, useScannerContext, useAuthFlowContext } from './components/layout/AppProviders';
import { LandingPage } from './components/pages/LandingPage';
import { AuditFlow } from './components/features/audit/AuditFlow';
import { DashboardPage } from './components/pages/DashboardPage';
import { DebugService } from './services/debugService';
import { PreflightRecord } from './services/preflightService';

const AppContent: React.FC = () => {
  const { user, signOut, clearGitHubState } = useAuthContext();
  const { view, previousView, navigate, resetToLanding, isPublicPage, getSEO } = useRouterContext();
  const {
    repoUrl,
    setRepoUrl,
    auditStats,
    reportData,
    historicalReportData,
    relatedAudits,
    handleAnalyze,
    handleConfirmAudit,
    handleStartAuditWithPreflight,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    clearAuditState,
  } = useAuditContext();
  const { scannerLogs, scannerProgress } = useScannerContext();
  const { isAuthOpen, handleSoftStart, openAuthModal, closeAuthModal } = useAuthFlowContext();

  // Handle soft start (auth flow version)
  const handleSoftStartWrapper = (url: string) => {
    if (user) {
      // If authenticated, start audit immediately
      handleAnalyze(url);
    } else {
      // If not authenticated, use auth flow
      handleSoftStart(url);
    }
  };

  // Comprehensive logout handler
  const handleSignOut = async () => {
    // Capture pre-logout storage state for debugging
    if (import.meta.env.DEV) {
      console.log('📸 Pre-logout storage state:');
      DebugService.logStorageSnapshot('Before Logout');
    }

    try {
      // Sign out (this also clears localStorage/sessionStorage)
      await signOut();

      // Clear GitHub auth state (tokens, account info)
      clearGitHubState();

      // Clear all audit state
      clearAuditState();

      // Reset router to landing page
      resetToLanding();

      // Verify clean logout in dev mode
      if (import.meta.env.DEV) {
        setTimeout(() => {
          DebugService.verifyCleanLogout();
          DebugService.auditStorageForSensitiveData();
        }, 100);
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Still attempt cleanup even if sign out fails
      clearGitHubState();
      clearAuditState();
      resetToLanding();
    }
  };

  // Extracted inline functions to prevent recreation on every render
  const handleRunTier = useCallback(async (tier: string, url: string, config?: any) => {
    setRepoUrl(url);

    // When coming from report page, try to reuse existing preflight instead of always going through modal
    try {
      const { fetchPreflight } = await import('./services/preflightService');
      const preflightResponse = await fetchPreflight(url);

      if (preflightResponse.success && preflightResponse.preflight) {
        // We have a valid preflight, use it directly
        const preflight = preflightResponse.preflight;
        await handleStartAuditWithPreflight(url, tier, preflight);
        return;
      }
    } catch (error) {
      console.warn('Failed to check for existing preflight, falling back to modal:', error);
      // Fall through to modal approach
    }

    // No valid preflight found, go through modal
    navigate('preflight');
  }, [setRepoUrl, navigate, handleStartAuditWithPreflight]);

  const handleStartAuditFromDashboard = useCallback(async (url: string, tier: string) => {
    // Always go through preflight flow - simpler and more reliable
    setRepoUrl(url);
    navigate('preflight');
  }, [setRepoUrl, navigate]);

  const handleCancelPreflight = useCallback(() => {
    navigate(previousView);
  }, [navigate, previousView]);

  const seoData = getSEO(reportData);

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
            previousView={previousView}
            repoUrl={repoUrl}
            scannerLogs={scannerLogs}
            scannerProgress={scannerProgress}
            reportData={reportData}
            historicalReportData={historicalReportData}
            relatedAudits={relatedAudits}
            onConfirmAudit={handleConfirmAudit}
            onCancelPreflight={handleCancelPreflight}
            onRestart={handleRestart}
            onSelectAudit={handleSelectAudit}
            onRunTier={handleRunTier}
          />
        );
      case 'pricing':
        return <Pricing />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
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