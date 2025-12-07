import React, { useState, useEffect } from 'react';
import Hero from './components/Hero';
import PreflightModal from './components/PreflightModal';
import Scanner from './components/Scanner';
import ReportDashboard from './components/ReportDashboard';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Pricing from './components/Pricing';
import About from './components/About';
import Contact from './components/Contact';
import AuthModal from './components/AuthModal';
import SEO from './components/SEO';
import { ViewState, AuditStats, RepoReport, Issue } from './types';
import { Tables } from './src/integrations/supabase/types';
import { generateAuditReport } from './services/geminiService';
import { fetchRepoMap, parseGitHubUrl } from './services/githubService';
import { useAuth } from './hooks/useAuth';
import { useGitHubAuth } from './hooks/useGitHubAuth';
import { supabase } from './src/integrations/supabase/client';

const App: React.FC = () => {
  const { user, signOut } = useAuth();
  const { getGitHubToken } = useGitHubAuth();
  const [view, setView] = useState<ViewState>('landing');
  const [previousView, setPreviousView] = useState<ViewState>('landing'); // Track where user came from

  // Ensure users can always access the landing page
  const navigateToLanding = () => {
    setView('landing');
  };
  const [repoUrl, setRepoUrl] = useState('');
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [reportData, setReportData] = useState<RepoReport | null>(null);
  const [historicalReportData, setHistoricalReportData] = useState<RepoReport | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string | null>(null);

  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);

  const addLog = (msg: string) => setScannerLogs(prev => [...prev, msg]);

  // Supabase SDK handles OAuth callback automatically via onAuthStateChange in useAuth hook

  // Restore pending repo URL from localStorage on app load
  useEffect(() => {
    const stored = localStorage.getItem('pendingRepoUrl');
    if (stored) {
      setPendingRepoUrl(stored);
      localStorage.removeItem('pendingRepoUrl');
    }
  }, []);

  // Close auth modal and navigate to dashboard when user logs in
  // Also auto-start audit if there's a pending repo URL
  useEffect(() => {
    if (user) {
      setIsAuthOpen(false);

      // If there's a pending repo URL, start the audit automatically
      if (pendingRepoUrl) {
        setRepoUrl(pendingRepoUrl);
        setPendingRepoUrl(null);
        setPreviousView('landing');
        setView('preflight');
        return;
      }

      // Navigate to dashboard if on landing page
      if (view === 'landing') {
        setView('dashboard');
      }
    }
  }, [user, pendingRepoUrl]);

  const handleAnalyze = (url: string) => {
    setRepoUrl(url);
    setPreviousView('landing');
    setView('preflight');
  };

  const handleSoftStart = (url: string) => {
    // Check if user is authenticated
    if (user) {
      // If authenticated, start audit immediately
      handleAnalyze(url);
    } else {
      // If not authenticated, store URL and show sign-in
      localStorage.setItem('pendingRepoUrl', url);
      setPendingRepoUrl(url);
      setIsAuthOpen(true);
    }
  };

  const handleConfirmAudit = async (tier: string, stats: AuditStats) => {
    setAuditStats(stats);
    setView('scanning');
    setScannerLogs([]);
    setScannerProgress(0);

    // EXECUTION ENGINE
    try {
      const repoInfo = parseGitHubUrl(repoUrl);
      if (!repoInfo) throw new Error("Invalid URL");

      // Step 1: Initialize
      addLog(`[System] Initializing audit for ${repoInfo.owner}/${repoInfo.repo}...`);
      setScannerProgress(10);

      // Step 2: Fetch Files (Real API)
      addLog(`[Network] Connecting to GitHub API...`);
      await new Promise(r => setTimeout(r, 500));

      addLog(`[Network] Downloading source tree (Map Only)...`);
      // Pass GitHub token for private repo access
      const githubToken = await getGitHubToken();
      // NEW: Fetch Map, NOT Content
      const fileMap = await fetchRepoMap(repoInfo.owner, repoInfo.repo, githubToken || undefined);

      addLog(`[Success] Mapped ${fileMap.length} files.`);
      setScannerProgress(40);

      // Step 3: Parse
      addLog(`[Agent: Parser] Analyzing structure...`);
      await new Promise(r => setTimeout(r, 800)); // Simulate AST parsing time
      setScannerProgress(60);

      // Step 4: AI Audit (Real API)
      addLog(`[Agent: Security] Sending metadata to Brain...`);
      addLog(`[System] Running ${tier.toUpperCase()} audit tier...`);
      const report = await generateAuditReport(repoInfo.repo, stats, fileMap, tier);

      addLog(`[Success] Report generated successfully.`);
      addLog(`[System] Finalizing health score: ${report.healthScore}/100`);
      setScannerProgress(100);

      setReportData(report);
      // Short delay to let user see 100%
      setTimeout(() => setView('report'), 1000);

    } catch (e: any) {
      addLog(`[Error] Audit Failed: ${e.message}`);
      addLog(`[System] Terminating process.`);
      console.error("Failed to generate report", e);
    }
  };

  const handleRestart = () => {
    setView('landing');
    setRepoUrl('');
    setReportData(null);
    setHistoricalReportData(null);
    setAuditStats(null);
    setScannerLogs([]);
    setScannerProgress(0);
  };

  const handleViewHistoricalReport = (audit: Tables<'audits'>) => {
    // Explicitly cast the JSON data to the Issue[] type
    const issues = (audit.issues as unknown as Issue[]) || [];
    const repoName = audit.repo_url.split('/').slice(-2).join('/'); // Extract owner/repo format

    // Create basic stats if not available
    const stats: AuditStats = {
      files: issues.length > 0 ? Math.max(...issues.map((i: any) => i.filePath ? 1 : 0).concat([1])) : 1,
      tokens: 'N/A',
      language: 'Mixed',
      languagePercent: 100
    };

    const report: RepoReport = {
      repoName,
      healthScore: audit.health_score || 0,
      issues,
      summary: audit.summary || 'No summary available',
      stats
    };

    setHistoricalReportData(report);
    setView('report');
  };

  const isPublicPage = ['landing', 'pricing', 'about', 'contact', 'preflight', 'dashboard', 'report'].includes(view);

  // SEO Strategy Configuration
  const getSEO = () => {
    switch (view) {
      case 'landing':
        return {
          title: "SCAI - AI Code Auditor & Security Scanner",
          description: "The AI Senior Engineer that never sleeps. Instant automated code review, security scanning, and technical debt audit for your GitHub repositories.",
          keywords: "AI code review, static analysis, github security scanner, technical debt audit"
        };
      case 'pricing':
        return {
          title: "Pricing - SCAI",
          description: "Simple, transparent pricing for automated code reviews. Start auditing your technical debt for free.",
          keywords: "code review pricing, static analysis cost, saas pricing"
        };
      case 'about':
        return {
          title: "About Us - The AI Senior Engineer",
          description: "SCAI is built by ex-FAANG engineers to democratize world-class software architecture and security audits.",
          keywords: "automated software engineering, ai developer tools, code quality mission"
        };
      case 'contact':
        return {
          title: "Contact Sales - SCAI",
          description: "Get in touch with our team for enterprise security audits, on-premise deployments, and partnership inquiries.",
          keywords: "enterprise code security, contact support"
        };
      case 'report':
        return {
          title: reportData ? `Audit Result: ${reportData.repoName} (${reportData.healthScore}/100)` : "Audit Report - SCAI",
          description: reportData ? `AI Code Audit for ${reportData.repoName}. Found ${reportData.issues.length} issues impacting security and performance.` : "View your code audit report.",
          keywords: "code audit report, security vulnerabilities found, performance bottlenecks"
        };
      default:
        return {
          title: "SCAI - Code. Perfected.",
          description: "Instant security, performance, and architecture audits for any codebase.",
          keywords: "ai code tools"
        };
    }
  };

  const seoData = getSEO();

  const renderContent = () => {
    switch (view) {
      case 'landing':
        return <Hero onAnalyze={handleAnalyze} onSoftStart={handleSoftStart} />;
      case 'preflight':
        return (
          <PreflightModal
            repoUrl={repoUrl}
            onConfirm={handleConfirmAudit}
            onCancel={() => setView(previousView)}
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
          <Dashboard
            onNavigate={setView}
            onViewReport={handleViewHistoricalReport}
            onStartAudit={(url, tier) => {
              setRepoUrl(url);
              setPreviousView('dashboard');
              setView('preflight');
            }}
          />
        );
      case 'scanning':
        return <Scanner logs={scannerLogs} progress={scannerProgress} />;
      case 'report':
        const displayData = reportData || historicalReportData;
        return displayData ? (
          <ReportDashboard
            data={displayData}
            onRestart={handleRestart}
            onRunTier={(tier, url) => {
              // For upsells, go through preflight to reload stats
              setRepoUrl(url);
              setPreviousView('report');
              setView('preflight');
            }}
          />
        ) : null;
      default:
        return <Hero onAnalyze={handleAnalyze} />;
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
          onNavigate={setView}
          onSignInClick={() => setIsAuthOpen(true)}
          user={user}
          onSignOut={signOut}
          onLogoClick={navigateToLanding}
        />
      )}

      {renderContent()}

      {isPublicPage && <Footer onNavigate={setView} />}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
};

export default App;