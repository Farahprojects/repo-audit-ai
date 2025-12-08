import React from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Pricing from './components/Pricing';
import About from './components/About';
import Contact from './components/Contact';
import AuthModal from './components/AuthModal';
import SEO from './components/SEO';
import { ViewState } from './types';
import { useAuth } from './hooks/useAuth';
import { useGitHubAuth } from './hooks/useGitHubAuth';
import { useAppRouter } from './hooks/useAppRouter';
import { useAuditOrchestrator } from './hooks/useAuditOrchestrator';
import { useAuthFlow } from './hooks/useAuthFlow';
import { AppProviders } from './components/AppProviders';
import { LandingPage } from './components/LandingPage';
import { AuditFlow } from './components/AuditFlow';
import { DashboardPage } from './components/DashboardPage';

const App: React.FC = () => {
  const { user, signOut } = useAuth();
  const { getGitHubToken } = useGitHubAuth();

  // Navigation logic
  const router = useAppRouter();

  // Audit orchestration
  const auditOrchestrator = useAuditOrchestrator({
    user,
    getGitHubToken,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Authentication flow
  const authFlow = useAuthFlow({
    user,
    view: router.view,
    pendingRepoUrl: auditOrchestrator.pendingRepoUrl,
    setPendingRepoUrl: auditOrchestrator.setPendingRepoUrl,
    navigate: router.navigate,
    setPreviousView: router.setPreviousView,
  });

  // Handle soft start (auth flow version)
  const handleSoftStart = (url: string) => {
    if (user) {
      // If authenticated, start audit immediately
      auditOrchestrator.handleAnalyze(url);
    } else {
      // If not authenticated, use auth flow
      authFlow.handleSoftStart(url);
    }
  };

  const seoData = router.getSEO(auditOrchestrator.reportData);

  const renderContent = () => {
    switch (router.view) {
      case 'landing':
        return (
          <LandingPage
            onAnalyze={auditOrchestrator.handleAnalyze}
            onSoftStart={handleSoftStart}
          />
        );
      case 'preflight':
      case 'scanning':
      case 'report':
        return (
          <AuditFlow
            view={router.view}
            previousView={router.previousView}
            repoUrl={auditOrchestrator.repoUrl}
            scannerLogs={auditOrchestrator.scannerLogs}
            scannerProgress={auditOrchestrator.scannerProgress}
            reportData={auditOrchestrator.reportData}
            historicalReportData={auditOrchestrator.historicalReportData}
            relatedAudits={auditOrchestrator.relatedAudits}
            onConfirmAudit={auditOrchestrator.handleConfirmAudit}
            onCancelPreflight={() => router.navigate(router.previousView)}
            onRestart={auditOrchestrator.handleRestart}
            onSelectAudit={auditOrchestrator.handleSelectAudit}
            onRunTier={(tier, url, config) => {
              auditOrchestrator.setRepoUrl(url);
              if (config) auditOrchestrator.setAuditConfig(config);
              router.setPreviousView('report');
              router.navigate('preflight');
            }}
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
            onNavigate={router.navigate}
            onViewReport={auditOrchestrator.handleViewHistoricalReport}
            onStartAudit={(url, tier) => {
              auditOrchestrator.setRepoUrl(url);
              router.setPreviousView('dashboard');
              router.navigate('preflight');
            }}
          />
        );
      default:
        return (
          <LandingPage
            onAnalyze={auditOrchestrator.handleAnalyze}
            onSoftStart={handleSoftStart}
          />
        );
    }
  };

  return (
    <AppProviders>
    <div className="bg-background min-h-screen text-foreground font-sans antialiased tracking-tight">
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
      />

        {router.isPublicPage && (
        <Navbar
            currentView={router.view}
            onNavigate={router.navigate}
            onSignInClick={authFlow.openAuthModal}
          user={user}
          onSignOut={signOut}
        />
      )}

      {renderContent()}

        {router.isPublicPage && <Footer onNavigate={router.navigate} />}

        <AuthModal
          isOpen={authFlow.isAuthOpen}
          onClose={authFlow.closeAuthModal}
        />
    </div>
    </AppProviders>
  );
};

export default App;