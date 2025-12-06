import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { supabase } from '../src/integrations/supabase/client';
import { Tables } from '../src/integrations/supabase/types';
import { Calendar, ExternalLink, TrendingUp, FileText, RefreshCw, AlertCircle, Eye, Search, Zap } from 'lucide-react';
import TierBadges, { TIERS, AuditTier } from './TierBadges';

type Audit = Tables<'audits'> & { tier?: string };

interface DashboardProps {
  onNavigate: (view: ViewState) => void;
  onViewReport?: (audit: Audit) => void;
  onStartAudit?: (repoUrl: string, tier: string) => void;
}

// Group audits by repo URL
interface RepoGroup {
  repoUrl: string;
  repoName: string;
  audits: Audit[];
  completedTiers: string[];
  latestAudit: Audit;
  bestScore: number;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onViewReport, onStartAudit }) => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newRepoUrl, setNewRepoUrl] = useState('');

  useEffect(() => {
    fetchUserAudits();
  }, []);

  const fetchUserAudits = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audits')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAudits(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audits');
    } finally {
      setLoading(false);
    }
  };

  const handleViewReport = (audit: Audit) => {
    if (onViewReport) {
      onViewReport(audit);
    }
  };

  const handleStartNewAudit = () => {
    if (newRepoUrl.trim() && onStartAudit) {
      onStartAudit(newRepoUrl.trim(), 'shape');
    }
  };

  const handleUpgradeTier = (repoUrl: string, tier: AuditTier) => {
    if (onStartAudit) {
      onStartAudit(repoUrl, tier);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const extractRepoName = (repoUrl: string) => {
    const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
    return match ? match[1] : repoUrl;
  };

  const getHealthScoreColor = (score: number | null) => {
    if (!score) return 'text-slate-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthScoreBg = (score: number | null) => {
    if (!score) return 'bg-slate-100';
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  // Group audits by repository
  const repoGroups: RepoGroup[] = React.useMemo(() => {
    const groups = new Map<string, Audit[]>();

    for (const audit of audits) {
      const key = audit.repo_url;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(audit);
    }

    return Array.from(groups.entries()).map(([repoUrl, repoAudits]) => {
      const completedTiers = [...new Set(repoAudits.map(a => (a as any).tier || 'shape'))];
      const latestAudit = repoAudits[0];
      const bestScore = Math.max(...repoAudits.map(a => a.health_score || 0));

      return {
        repoUrl,
        repoName: extractRepoName(repoUrl),
        audits: repoAudits,
        completedTiers,
        latestAudit,
        bestScore,
      };
    });
  }, [audits]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
            <span className="ml-3 text-lg text-slate-600">Loading your dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <span className="ml-3 text-lg text-red-600">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Dashboard</h1>
          <p className="text-slate-600">
            Audit your repos, track progress, and unlock deeper insights.
          </p>
        </div>

        {/* New Audit Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Start New Audit</h2>
              <p className="text-sm text-slate-500">Enter a GitHub repository URL to analyze</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 pl-12 pr-6 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleStartNewAudit()}
              />
            </div>
            <button
              onClick={handleStartNewAudit}
              disabled={!newRepoUrl.trim()}
              className="px-6 py-3 bg-slate-900 text-white font-semibold rounded-full hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-900/10"
            >
              Analyze
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-slate-900">{repoGroups.length}</p>
                <p className="text-sm text-slate-500">Repos Analyzed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {audits.length > 0 ? Math.round(audits.reduce((acc, audit) => acc + (audit.health_score || 0), 0) / audits.length) : 0}
                </p>
                <p className="text-sm text-slate-500">Avg. Health Score</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-slate-900">{audits.length}</p>
                <p className="text-sm text-slate-500">Total Audits</p>
              </div>
            </div>
          </div>
        </div>

        {/* Repos List */}
        {repoGroups.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No audits yet</h3>
            <p className="text-slate-500 mb-6">
              Start by entering a GitHub repo URL above.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Your Repositories</h2>
              <span className="text-xs text-slate-400">{repoGroups.length} repos</span>
            </div>

            <div className="divide-y divide-slate-100">
              {repoGroups.map((group) => (
                <div key={group.repoUrl} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Repo info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {group.repoName}
                        </h3>
                        <div className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold border ${getHealthScoreBg(group.bestScore)} ${getHealthScoreColor(group.bestScore)}`}>
                          {group.bestScore}
                        </div>
                      </div>

                      {/* Tier badges */}
                      <TierBadges
                        completedTiers={group.completedTiers}
                        onUpgrade={(tier) => handleUpgradeTier(group.repoUrl, tier)}
                        compact
                      />

                      <p className="text-xs text-slate-400 mt-2">
                        Last audit: {formatDate(group.latestAudit.created_at)}
                      </p>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      <a
                        href={group.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="View on GitHub"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleViewReport(group.latestAudit)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View Report
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
