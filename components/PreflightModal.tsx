import React, { useEffect, useState } from 'react';
import { CheckCircle, Zap, AlertTriangle, Lock, ArrowRight, Mail } from 'lucide-react';
import { AuditStats } from '../types';
import { parseGitHubUrl, fetchRepoStats } from '../services/githubService';
import GitHubConnectModal from './GitHubConnectModal';
import { useGitHubAuth } from '../hooks/useGitHubAuth';

interface PreflightModalProps {
  repoUrl: string;
  onConfirm: (tier: 'lite' | 'deep' | 'ultra', stats: AuditStats) => void;
  onCancel: () => void;
}

type ModalStep = 'analysis' | 'selection' | 'auth' | 'github-connect';

const PreflightModal: React.FC<PreflightModalProps> = ({ repoUrl, onConfirm, onCancel }) => {
  const [step, setStep] = useState<ModalStep>('analysis');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [selectedTier, setSelectedTier] = useState<'lite' | 'deep' | 'ultra'>('lite');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isGitHubConnected, getGitHubToken, signInWithGitHub, isConnecting } = useGitHubAuth();

  const loadStats = async (token?: string) => {
    // Prevent double execution
    if (isLoading) {
      console.log('🚫 [PreflightModal] loadStats already running, skipping');
      return;
    }

    console.log('🚀 [PreflightModal] Starting loadStats for repo:', repoUrl);
    console.log('🚀 [PreflightModal] GitHub token available:', !!token);

    setIsLoading(true);
    setLoading(true);
    setError(null);
    setIsPrivateRepo(false);

    console.log('🔍 [PreflightModal] Parsing GitHub URL...');
    const repoInfo = parseGitHubUrl(repoUrl);
    console.log('🔍 [PreflightModal] Parsed repo info:', repoInfo);

    if (!repoInfo) {
      console.log('❌ [PreflightModal] Invalid GitHub URL format');
      setError("Please enter a complete GitHub repository URL (e.g., https://github.com/owner/repository-name)");
      setLoading(false);
      return;
    }

    console.log('📡 [PreflightModal] Calling fetchRepoStats...');
    try {
      const data = await fetchRepoStats(repoInfo.owner, repoInfo.repo, token);
      console.log('✅ [PreflightModal] fetchRepoStats success:', data);
      setStats(data);
      setStep('selection');
      console.log('🎯 [PreflightModal] Moving to selection step');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log('❌ [PreflightModal] fetchRepoStats failed:', message);

      // Check if this is a private repo error
      if (message.startsWith('PRIVATE_REPO:')) {
        console.log('🔐 [PreflightModal] Detected private repo error');
        setIsPrivateRepo(true);
        setError(message.replace('PRIVATE_REPO:', ''));
        setStep('github-connect');
        console.log('🎯 [PreflightModal] Moving to github-connect step');
      } else {
        console.log('⚠️ [PreflightModal] Setting generic error:', message);
        setError(message);
      }
    } finally {
      setLoading(false);
      setIsLoading(false);
      console.log('🏁 [PreflightModal] loadStats completed');
    }
  };

  useEffect(() => {
    // On mount, try with existing GitHub token if connected
    const initLoad = async () => {
      const token = await getGitHubToken();
      loadStats(token || undefined);
    };
    initLoad();
  }, [repoUrl]);

  // After GitHub OAuth completes, retry with the new token
  useEffect(() => {
    const retryWithToken = async () => {
      if (isGitHubConnected && step === 'github-connect') {
        const token = await getGitHubToken();
        if (token) {
          loadStats(token);
        }
      }
    };
    retryWithToken();
  }, [isGitHubConnected, step]);

  const handleGitHubConnect = async () => {
    // Store current URL to return after OAuth
    await signInWithGitHub(window.location.href);
  };

  const handleTierSelect = (tier: 'lite' | 'deep' | 'ultra') => {
    if (tier === 'lite') {
      onConfirm(tier, stats!);
    } else {
      setSelectedTier(tier);
      setStep('auth');
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      onConfirm(selectedTier, stats!);
    }
  };

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

  // GitHub Connect Modal for private repos
  if (step === 'github-connect' && isPrivateRepo) {
    return (
      <GitHubConnectModal
        repoUrl={repoUrl}
        onConnect={handleGitHubConnect}
        onCancel={onCancel}
        isConnecting={isConnecting}
      />
    );
  }

  // Generic error (not private repo)
  if (error && !isPrivateRepo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Unable to Access Repository</h3>
          <p className="text-slate-500 mb-8">{error}</p>
          <button
            onClick={onCancel}
            className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-medium transition-colors shadow-lg"
          >
            Try Another Repo
          </button>
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
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Complexity</p>
            <p className="text-3xl font-bold text-slate-900">{stats?.tokens}</p>
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
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full mb-4">FREE</span>
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
                  <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full mb-4 group-hover:bg-orange-100 transition-colors">PRO</span>
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
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full mb-4 group-hover:bg-red-100 transition-colors">PREMIUM</span>
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

          {step === 'auth' && (
            <div className="max-w-md mx-auto animate-in fade-in slide-in-from-right-4 duration-300 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Unlock Report</h3>
              <p className="text-slate-500 mb-8">
                We need your email to securely deliver the
                <span className="text-slate-900 font-bold"> {selectedTier === 'deep' ? 'Senior' : 'CTO'} Audit</span> results.
              </p>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="work@company.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 pl-12 pr-6 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  Start Agents <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <button
                onClick={() => setStep('selection')}
                className="mt-6 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors"
              >
                Back to plans
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default PreflightModal;