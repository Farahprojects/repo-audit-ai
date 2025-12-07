import React, { useState, useEffect } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { Tables } from '../src/integrations/supabase/types';
import { Search, Zap, FileText, TrendingUp, Shield, Sparkles } from 'lucide-react';
import { AuditTier } from './TierBadges';

type SystemPrompt = Tables<'system_prompts'>;

interface AuditSidebarProps {
  onStartAudit: (repoUrl: string, tier: AuditTier) => void;
}

const AuditSidebar: React.FC<AuditSidebarProps> = ({ onStartAudit }) => {
  const [auditTypes, setAuditTypes] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRepoUrl, setNewRepoUrl] = useState('');

  useEffect(() => {
    fetchAuditTypes();
  }, []);

  const fetchAuditTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('system_prompts')
        .select('*')
        .eq('is_active', true)
        .order('credit_cost', { ascending: true });

      if (error) throw error;
      setAuditTypes(data || []);
    } catch (err) {
      console.error('Failed to load audit types:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAuditIcon = (tier: string) => {
    switch (tier) {
      case 'shape':
        return <Search className="w-5 h-5" />;
      case 'conventions':
        return <FileText className="w-5 h-5" />;
      case 'performance':
        return <TrendingUp className="w-5 h-5" />;
      case 'security':
        return <Shield className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  const handleStartAudit = (tier: AuditTier) => {
    if (newRepoUrl.trim()) {
      onStartAudit(newRepoUrl.trim(), tier);
      setNewRepoUrl('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, tier: AuditTier) => {
    if (e.key === 'Enter') {
      handleStartAudit(tier);
    }
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-full overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Available Audits</h2>
          <p className="text-sm text-slate-500">Choose an audit type to analyze your repository</p>
        </div>

        {/* Repo URL Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Repository URL
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={newRepoUrl}
              onChange={(e) => setNewRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
        </div>

        {/* Audit Types */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-slate-100 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : (
            auditTypes.map((auditType) => (
              <div
                key={auditType.tier}
                className="group relative bg-slate-50 border border-slate-200 rounded-lg p-4 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer"
                onClick={() => handleStartAudit(auditType.tier as AuditTier)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
                      {getAuditIcon(auditType.tier)}
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900 text-sm">
                        {auditType.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {auditType.credit_cost} credit{auditType.credit_cost !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Zap className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {auditType.description}
                </p>

                {/* Hover overlay for better UX */}
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none" />
              </div>
            ))
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            <strong>Tip:</strong> Start with Shape Check for a quick overview, then upgrade to deeper analysis tiers.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuditSidebar;
