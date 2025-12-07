import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { supabase } from '../src/integrations/supabase/client';
import { Tables } from '../src/integrations/supabase/types';
import { ExternalLink, RefreshCw, AlertCircle, Eye } from 'lucide-react';
import AuditSidebar from './AuditSidebar';
import AuditHistory from './AuditHistory';
import { AuditTier } from './TierBadges';

type Audit = Tables<'audits'>;

interface DashboardProps {
  onNavigate: (view: ViewState) => void;
  onViewReport?: (audit: Audit) => void;
  onStartAudit?: (repoUrl: string, tier: AuditTier) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onViewReport, onStartAudit }) => {
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



  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
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
      <div className="min-h-screen bg-white pt-32 pb-12">
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
        <div className="flex gap-8">

          {/* Sidebar */}
          <AuditSidebar onStartAudit={onStartAudit} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Dashboard</h1>
              <p className="text-slate-600">
                Audit your repos, track progress, and unlock deeper insights.
              </p>
            </div>


        {/* Audit History */}
        <AuditHistory onViewReport={handleViewReport} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
