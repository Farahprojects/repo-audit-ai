import React, { useState, useEffect } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { Tables } from '../src/integrations/supabase/types';
import { Calendar, ExternalLink, TrendingUp, FileText, RefreshCw, AlertCircle, Eye, Search, Zap, Clock, CheckCircle, XCircle, PlayCircle } from 'lucide-react';

type Audit = Tables<'audits'>;
type SystemPrompt = Tables<'system_prompts'>;

type AuditWithPrompt = Audit & {
  system_prompts?: SystemPrompt;
};

interface AuditHistoryProps {
  onViewReport?: (audit: Audit) => void;
}

const AuditHistory: React.FC<AuditHistoryProps> = ({ onViewReport }) => {
  const [audits, setAudits] = useState<AuditWithPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditHistory();
  }, []);

  const fetchAuditHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('audits')
        .select(`
          *,
          system_prompts!inner(name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAudits(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'processing':
      case 'running':
        return <PlayCircle className="w-4 h-4 text-blue-600" />;
      case 'queued':
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'processing':
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'queued':
      case 'pending':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  const getAuditTypeIcon = (tier: string) => {
    switch (tier) {
      case 'shape':
        return <Search className="w-4 h-4" />;
      case 'conventions':
        return <FileText className="w-4 h-4" />;
      case 'performance':
        return <TrendingUp className="w-4 h-4" />;
      case 'security':
        return <Zap className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const extractRepoName = (repoUrl: string) => {
    const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
    return match ? match[1] : repoUrl;
  };

  const handleViewReport = (audit: Audit) => {
    if (onViewReport) {
      onViewReport(audit);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-48"></div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-64 mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-32"></div>
                </div>
                <div className="h-8 bg-slate-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <div>
            <h3 className="font-medium text-red-900">Failed to load audit history</h3>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recent Audits</h2>
          <p className="text-sm text-slate-500 mt-1">
            {audits.length > 0 ? `${audits.length} audit${audits.length !== 1 ? 's' : ''} completed` : 'No audits yet'}
          </p>
        </div>
        <button
          onClick={fetchAuditHistory}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-600 mb-2">No audits yet</h3>
          <p className="text-slate-500 mb-6">
            Start your first audit using the sidebar on the left.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {audits.map((audit) => (
            <div key={audit.audit_id} className="p-6 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                {/* Left: Audit info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {extractRepoName(audit.repo_url)}
                    </h3>
                    <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(audit.status || 'unknown')}`}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(audit.status || 'unknown')}
                        {audit.status || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                    <span className="flex items-center gap-1">
                      {getAuditTypeIcon(audit.tier || 'unknown')}
                      {audit.system_prompts?.name || audit.tier || 'Unknown'}
                    </span>
                    <span>{formatDate(audit.created_at)}</span>
                    {audit.total_tokens && (
                      <span>{audit.total_tokens.toLocaleString()} tokens</span>
                    )}
                  </div>

                  {audit.health_score !== null && audit.health_score !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">Score:</span>
                      <span className={`text-sm font-bold px-2 py-1 rounded ${
                        audit.health_score >= 80 ? 'text-green-700 bg-green-50' :
                        audit.health_score >= 60 ? 'text-yellow-700 bg-yellow-50' :
                        'text-red-700 bg-red-50'
                      }`}>
                        {audit.health_score}/100
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                  <a
                    href={audit.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="View on GitHub"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {audit.status === 'completed' && (
                    <button
                      onClick={() => handleViewReport(audit)}
                      className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View Report
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditHistory;
