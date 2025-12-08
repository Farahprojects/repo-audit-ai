import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle, Zap, AlertTriangle, Loader2 } from 'lucide-react';
import { AuditStats, ComplexityFingerprint } from '../types';
import { parseGitHubUrl, fetchRepoPreflight } from '../services/githubService';
import { CostEstimator, AuditTier } from '../services/costEstimator';
import GitHubConnectModal from './GitHubConnectModal';
import { useGitHubAuth } from '../hooks/useGitHubAuth';

interface PreflightModalProps {
  repoUrl: string;
  onConfirm: (tier: 'lite' | 'deep' | 'ultra', stats: AuditStats) => void;
  onCancel: () => void;
}

type ModalStep = 'analysis' | 'selection' | 'github-connect';

interface TierEstimates {
  shape: { estimatedTokens: number; formatted: string };
  conventions: { estimatedTokens: number; formatted: string };
  performance: { estimatedTokens: number; formatted: string };
  security: { estimatedTokens: number; formatted: string };
}

const PreflightModal: React.FC<PreflightModalProps> = ({ repoUrl, onConfirm, onCancel }) => {
  const [step, setStep] = useState<ModalStep>('analysis');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [fingerprint, setFingerprint] = useState<ComplexityFingerprint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tierEstimates, setTierEstimates] = useState<TierEstimates | null>(null);
  const [estimatesLoading, setEstimatesLoading] = useState(false);

  const { isGitHubConnected, getGitHubToken, signInWithGitHub, isConnecting } = useGitHubAuth();

  const loadStats = async (token?: string) => {
    if (isLoading) {
      console.log('🚫 [PreflightModal] loadStats already running, skipping');
      return;
    }

    console.log('🚀 [PreflightModal] Starting loadStats for repo:', repoUrl);
    setIsLoading(true);
    setLoading(true);
    setError(null);

    const repoInfo = parseGitHubUrl(repoUrl);
    if (!repoInfo) {
      setError("Please enter a complete GitHub repository URL (e.g., https://github.com/owner/repository-name)");
      setLoading(false);
      return;
    }

    try {
      // UNIFIED PREFLIGHT - Single source of truth
      // One API call returns both stats and fingerprint
      // Backend handles all access control logic
      console.log('🚀 [PreflightModal] Calling unified preflight...');
      const { stats: statsData, fingerprint: fingerprintData } = await fetchRepoPreflight(
        repoInfo.owner,
        repoInfo.repo,
        token
      );
      console.log('✅ [PreflightModal] Preflight successful, repo is accessible');

      // Set combined data and proceed with tier selection
      setStats({ ...statsData, fingerprint: fingerprintData });
      setFingerprint(fingerprintData);
      setStep('selection');

      // Fetch tier estimates from edge function
      setEstimatesLoading(true);
      try {
        const estimates = await CostEstimator.getAllTierEstimatesAsync(fingerprintData);
        setTierEstimates(estimates as unknown as TierEstimates);
      } catch (estimateError) {
        console.error('[PreflightModal] Failed to fetch estimates:', estimateError);
        // Continue without estimates - will show fallback text
      } finally {
        setEstimatesLoading(false);
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log('🔍 [PreflightModal] Error caught:', message);
      if (message.includes('PRIVATE_REPO:')) {
        // Private repo detected - show GitHub connect modal, NO error message
        console.log('🔐 [PreflightModal] Private repo detected, opening GitHub connect modal');
        setStep('github-connect');
        setError(null);
        setLoading(false); // Stop loading immediately to show modal
        setIsLoading(false);
        return; // Exit early, skip finally block
      } else if (message.includes('Repository owner does not exist')) {
        // Owner doesn't exist - URL is definitely wrong
        setError(message);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initLoad = async () => {
      const token = await getGitHubToken();
      loadStats(token || undefined);
    };
    initLoad();
  }, [repoUrl]);

  // Handle GitHub OAuth connection - awaits completion before continuing
  const handleGitHubConnect = useCallback(async () => {
    console.log('🔐 [PreflightModal] Starting GitHub OAuth flow...');
    const result = await signInWithGitHub();

    if (result.success) {
      console.log('✅ [PreflightModal] GitHub OAuth succeeded, fetching token...');
      const token = await getGitHubToken();
      if (token) {
        console.log('🚀 [PreflightModal] Token retrieved, continuing to loadStats...');
        loadStats(token);
      } else {
        console.error('❌ [PreflightModal] Failed to get token after successful OAuth');
        setError('Failed to retrieve GitHub access token');
      }
    } else {
      console.error('❌ [PreflightModal] GitHub OAuth failed:', result.error);
      setError(result.error || 'GitHub connection failed');
    }
  }, [signInWithGitHub, getGitHubToken]);

  const handleTierSelect = useCallback((tier: 'lite' | 'deep' | 'ultra') => {
    onConfirm(tier, stats!);
  }, [onConfirm, stats]);

  // Helper to get formatted estimate or fallback
  const getEstimateDisplay = (tier: keyof TierEstimates, fallback: string) => {
    if (estimatesLoading) {
      return <Loader2 className="w-3 h-3 animate-spin inline" />;
    }
    if (tierEstimates?.[tier]) {
      return `~${tierEstimates[tier].formatted} tokens`;
    }
    return fallback;
  };

  // IMPORTANT: Check for github-connect step FIRST, before loading check
  // This ensures the connect modal shows even if loading state hasn't fully resolved
  console.log('🔍 [PreflightModal] Render state:', { step, error, loading });

  if (step === 'github-connect') {
    console.log('🎯 [PreflightModal] Showing GitHubConnectModal');
    return (
      <GitHubConnectModal
        repoUrl={repoUrl}
        onConnect={handleGitHubConnect}
        onCancel={onCancel}
        isConnecting={isConnecting}
      />
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-xl">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-slate-100 border-t-primary rounded-full animate-spin mb-6"></div>
          <p className="text-slate-900 font-bold text-lg">Scanning Structure...</p>
          <p className="text-slate-500 text-sm">Fetching manifest files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/10 backdrop-blur-lg p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl shadow-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-slate-50 p-6 md:p-8 flex justify-between items-center border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="text-success w-5 h-5 fill-success/10" />
              Scan Complete
            </h2>
            <p className="text-slate-500 text-sm mt-1">{repoUrl}</p>
          </div>
          <button onClick={onCancel} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">
            &times;
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-white">
          <div className="p-8 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Files</p>
            <p className="text-3xl font-bold text-slate-900">{stats?.files}</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Size</p>
            <p className="text-3xl font-bold text-slate-900">{stats?.size}</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Language</p>
            <p className="text-3xl font-bold text-primary">{stats?.language}</p>
            <p className="text-xs text-slate-400 mt-1">{stats?.languagePercent}%</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 md:p-10 flex-1 overflow-y-auto bg-white">

          {step === 'selection' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-slate-900 text-center mb-10 text-xl font-semibold">Select Audit Depth</h3>
              <div className="grid md:grid-cols-4 gap-4">

                {/* Tier 1: Shape Check (Free) */}
                <div className="border border-slate-200 rounded-3xl p-5 hover:border-slate-300 transition-all flex flex-col items-center text-center">
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full mb-4">
                    {getEstimateDisplay('shape', 'FREE')}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Shape Check</h4>
                  <p className="text-sm text-slate-500 mb-6 flex-1">Repo structure, folder hygiene, missing files.</p>
                  <button
                    onClick={() => handleTierSelect('lite')}
                    className="w-full py-3 border border-slate-200 text-slate-600 rounded-full hover:bg-slate-50 font-medium transition-colors"
                  >
                    Run Free
                  </button>
                </div>

                {/* Tier 2: Conventions Check */}
                <div className="border-2 border-primary bg-white rounded-3xl p-5 relative shadow-xl shadow-primary/10 flex flex-col items-center text-center scale-[1.02] z-10">
                  <div className="absolute -top-3 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    POPULAR
                  </div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full mb-4">
                    {getEstimateDisplay('conventions', 'POPULAR')}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 mb-2 mt-2">Senior Check</h4>
                  <p className="text-sm text-slate-500 mb-6 flex-1">Craftsmanship, types, tests, docs.</p>
                  <button
                    onClick={() => handleTierSelect('deep')}
                    className="w-full py-3 bg-primary text-white font-bold rounded-full hover:bg-blue-600 transition-colors shadow-lg shadow-primary/25"
                  >
                    Run Deep
                  </button>
                </div>

                {/* Tier 3: Performance Check */}
                <div className="border border-slate-200 rounded-3xl p-5 hover:border-orange-200 transition-all flex flex-col items-center text-center group">
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full mb-4 group-hover:bg-orange-100 transition-colors">
                    {getEstimateDisplay('performance', 'PRO')}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Perf Audit</h4>
                  <p className="text-sm text-slate-500 mb-6 flex-1">N+1, leaks, re-renders, AI sins.</p>
                  <button
                    onClick={() => onConfirm('performance' as any, stats!)}
                    className="w-full py-3 border border-slate-200 text-slate-600 rounded-full hover:bg-slate-50 font-medium transition-colors"
                  >
                    Run Perf
                  </button>
                </div>

                {/* Tier 4: Security Audit */}
                <div className="border border-slate-200 rounded-3xl p-5 hover:border-red-200 transition-all flex flex-col items-center text-center group">
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full mb-4 group-hover:bg-red-100 transition-colors">
                    {getEstimateDisplay('security', 'PREMIUM')}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Security</h4>
                  <p className="text-sm text-slate-500 mb-6 flex-1">RLS, secrets, auth, vulnerabilities.</p>
                  <button
                    onClick={() => handleTierSelect('ultra')}
                    className="w-full py-3 border border-red-200 text-red-600 rounded-full hover:bg-red-50 font-bold transition-colors"
                  >
                    Run Security
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>

      {/* Error popup overlay */}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {error.includes('owner does not exist') ? 'Invalid Repository URL' : 'Unable to Access Repository'}
            </h3>
            <p className="text-slate-500 mb-8">{error}</p>
            <button
              onClick={onCancel}
              className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-medium transition-colors shadow-lg"
            >
              {error.includes('owner does not exist') ? 'Check URL Spelling' : 'Try Another Repo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreflightModal;
