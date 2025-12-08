import React from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Pricing from './components/Pricing';
import About from './components/About';
import Contact from './components/Contact';
import AuthModal from './components/AuthModal';
import SEO from './components/SEO';
import { AppProviders, useAuthContext, useReportContext } from './components/AppProviders';
import { LandingPage } from './components/LandingPage';
import { AuditFlow } from './components/AuditFlow';
import { DashboardPage } from './components/DashboardPage';

const AppContent: React.FC = () => {
  const { user, signOut } = useAuthContext();
  const {
    view,
    previousView,
    navigate,
    isPublicPage,
    getSEO,
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
    handleAnalyze,
    handleConfirmAudit,
    handleRestart,
    handleViewHistoricalReport,
    handleSelectAudit,
    isAuthOpen,
    handleSoftStart,
    openAuthModal,
    closeAuthModal,
  } = useReportContext();

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
            onRunTier={(tier, url, config) => {
              setRepoUrl(url);
              navigate('preflight');
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
            onNavigate={navigate}
            onViewReport={handleViewHistoricalReport}
            onStartAudit={(url, tier) => {
              setRepoUrl(url);
              navigate('preflight');
            }}
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
          onSignOut={signOut}
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