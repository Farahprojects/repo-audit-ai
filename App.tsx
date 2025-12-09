import React, { useCallback } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Pricing from './components/Pricing';
import About from './components/About';
import Contact from './components/Contact';
import AuthModal from './components/AuthModal';
import SEO from './components/SEO';
import { AppProviders, useAuthContext, useRouterContext, useAuditContext, useAuthFlowContext } from './components/AppProviders';
import { LandingPage } from './components/LandingPage';
import { AuditFlow } from './components/AuditFlow';
import { DashboardPage } from './components/DashboardPage';
import { DebugService } from './services/debugService';

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
    scannerLogs,
    scannerProgress,
    handleAnalyze,
    handleConfirmAudit,
    handleStartAuditWithPreflight,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    clearAuditState,
  } = useAuditContext();
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
  const handleRunTier = useCallback((tier: string, url: string, config?: any) => {
    setRepoUrl(url);
    navigate('preflight');
  }, [setRepoUrl, navigate]);

  const handleStartAuditFromDashboard = useCallback(async (url: string, tier: string) => {
    // Always go through preflight flow - simpler and more reliable
    setRepoUrl(url);
    navigate('preflight');
  }, [setRepoUrl, navigate]);

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
            onCancelPreflight={() => navigate(previousView)}
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