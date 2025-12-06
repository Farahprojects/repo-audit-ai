import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { supabase } from '../src/integrations/supabase/client';
import { Tables } from '../src/integrations/supabase/types';
import { Calendar, ExternalLink, TrendingUp, FileText, RefreshCw, AlertCircle, Eye } from 'lucide-react';

type Audit = Tables<'audits'>;

interface DashboardProps {
  onNavigate: (view: ViewState) => void;
  onViewReport?: (audit: Audit) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onViewReport }) => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const extractRepoName = (repoUrl: string) => {
    // Extract repo name from GitHub URL
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
    if (score >= 80) return 'bg-green-50';
    if (score >= 60) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
            <span className="ml-3 text-lg text-slate-600">Loading your audit history...</span>
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
    <div className="min-h-screen bg-white pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Audit Dashboard</h1>
          <p className="text-slate-600">
            View and revisit all your past repository analyses and health scores.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-50 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-slate-600" />
              <div>
                <p className="text-2xl font-bold text-slate-900">{audits.length}</p>
                <p className="text-sm text-slate-600">Total Audits</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-slate-600" />
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {audits.length > 0 ? Math.round(audits.reduce((acc, audit) => acc + (audit.health_score || 0), 0) / audits.length) : 0}
                </p>
                <p className="text-sm text-slate-600">Average Health Score</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-slate-600" />
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {audits.length > 0 ? formatDate(audits[0].created_at) : 'N/A'}
                </p>
                <p className="text-sm text-slate-600">Latest Audit</p>
              </div>
            </div>
          </div>
        </div>

        {/* Audits List */}
        {audits.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No audits yet</h3>
            <p className="text-slate-500 mb-6">
              Start by auditing your first repository to see your analysis history here.
            </p>
            <button
              onClick={() => onNavigate('landing')}
              className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-full font-semibold transition-all shadow-lg shadow-slate-900/20"
            >
              Start Your First Audit
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Audit History</h2>
            </div>

            <div className="divide-y divide-slate-100">
              {audits.map((audit) => (
                <div key={audit.id} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-3 h-3 rounded-full ${audit.health_score && audit.health_score >= 80 ? 'bg-green-500' : audit.health_score && audit.health_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>

                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 text-sm">
                          {extractRepoName(audit.repo_url)}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(audit.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${getHealthScoreBg(audit.health_score)} ${getHealthScoreColor(audit.health_score)}`}>
                          {audit.health_score ? `${audit.health_score}` : 'N/A'}
                        </div>

                        <a
                          href={audit.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <button
                          onClick={() => handleViewReport(audit)}
                          className="text-slate-600 hover:text-slate-900 transition-colors p-1"
                          title="View Report"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
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
