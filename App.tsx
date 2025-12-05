import React, { useState } from 'react';
import Hero from './components/Hero';
import PreflightModal from './components/PreflightModal';
import Scanner from './components/Scanner';
import ReportDashboard from './components/ReportDashboard';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Pricing from './components/Pricing';
import About from './components/About';
import Contact from './components/Contact';
import AuthModal from './components/AuthModal';
import SEO from './components/SEO';
import { ViewState, AuditStats, RepoReport } from './types';
import { generateAuditReport } from './services/geminiService';
import { fetchRepoFiles, parseGitHubUrl } from './services/githubService';
import { useAuth } from './hooks/useAuth';

const App: React.FC = () => {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<ViewState>('landing');
  const [repoUrl, setRepoUrl] = useState('');
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [reportData, setReportData] = useState<RepoReport | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  
  // Real-time Scanner State
  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [scannerProgress, setScannerProgress] = useState(0);

  const addLog = (msg: string) => setScannerLogs(prev => [...prev, msg]);

  const handleAnalyze = (url: string) => {
    setRepoUrl(url);
    setView('preflight');
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
        
        addLog(`[Network] Downloading source tree...`);
        const fileContents = await fetchRepoFiles(repoInfo.owner, repoInfo.repo);
        
        addLog(`[Success] Retrieved ${fileContents.length} critical source files.`);
        setScannerProgress(40);

        // Step 3: Parse
        addLog(`[Agent: Parser] Analyzing ${stats.language} syntax AST...`);
        await new Promise(r => setTimeout(r, 800)); // Simulate AST parsing time
        setScannerProgress(60);

        // Step 4: AI Audit (Real API)
        addLog(`[Agent: Security] Sending code context to Gemini 2.5...`);
        const report = await generateAuditReport(repoInfo.repo, stats, fileContents);
        
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
    setScannerLogs([]);
    setScannerProgress(0);
  };

  const isPublicPage = ['landing', 'pricing', 'about', 'contact', 'preflight'].includes(view);

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
      case 'preflight':
        return (
          <>
            <Hero onAnalyze={handleAnalyze} />
            {view === 'preflight' && (
              <PreflightModal 
                repoUrl={repoUrl} 
                onConfirm={handleConfirmAudit} 
                onCancel={() => setView('landing')} 
              />
            )}
          </>
        );
      case 'pricing':
        return <Pricing />;
      case 'about':
        return <About />;
      case 'contact':
        return <Contact />;
      case 'scanning':
        return <Scanner logs={scannerLogs} progress={scannerProgress} />;
      case 'report':
        return reportData ? (
          <ReportDashboard data={reportData} onRestart={handleRestart} />
        ) : null;
      default:
        return <Hero onAnalyze={handleAnalyze} />;
    }
  };

  return (
    <div className="bg-background min-h-screen text-slate-900 font-sans selection:bg-primary/20 selection:text-primary">
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
        />
      )}
      
      {renderContent()}

      {isPublicPage && <Footer onNavigate={setView} />}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
};

export default App;