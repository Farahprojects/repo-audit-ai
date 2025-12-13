import { useState, useMemo, useCallback } from 'react';
import { ViewState, RepoReport } from '../types';

export interface SEOData {
  title: string;
  description: string;
  keywords: string;
}

export const useAppRouter = () => {
  const [view, setView] = useState<ViewState>('landing');
  const [previousView, setPreviousView] = useState<ViewState>('landing');

  const navigate = useCallback((newView: ViewState) => {
    console.log(`[NAVIGATE] From ${view} to ${newView}`);
    console.log('[NAVIGATE] Stack trace:', new Error().stack);
    setPreviousView(view);
    setView(newView);
  }, [view]);

  const goBack = useCallback(() => {
    setView(previousView);
  }, [previousView]);

  const resetToLanding = useCallback(() => {
    setView('landing');
    setPreviousView('landing');
  }, []);

  const isPublicPage = useMemo(() => ['landing', 'pricing', 'about', 'contact', 'features', 'privacy', 'terms', 'legal', 'preflight', 'dashboard', 'report'].includes(view), [view]);

  const getSEO = useCallback((reportData?: RepoReport | null): SEOData => {
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
      case 'features':
        return {
          title: "Features - SCAI AI Code Auditor",
          description: "Explore SCAI's comprehensive AI-powered code auditing features including security scanning, performance analysis, and architecture review.",
          keywords: "code auditing features, ai code review, security scanning, performance analysis"
        };
      case 'privacy':
        return {
          title: "Privacy Policy - SCAI",
          description: "Learn how SCAI collects, uses, and protects your personal information and data privacy rights.",
          keywords: "privacy policy, data protection, gdpr compliance, privacy rights"
        };
      case 'terms':
        return {
          title: "Terms of Service - SCAI",
          description: "Terms and conditions for using SCAI's AI-powered code auditing and security scanning services.",
          keywords: "terms of service, user agreement, service terms, legal terms"
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
  }, [view]);

  // Return individual values to prevent unnecessary re-renders
  // Components can now selectively subscribe to only the values they need
  return {
    view,
    setView,
    previousView,
    setPreviousView,
    navigate,
    goBack,
    resetToLanding,
    isPublicPage,
    getSEO,
  };
};
