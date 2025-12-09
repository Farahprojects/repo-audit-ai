import React from 'react';
import { ViewState } from '../../types';
import { Tables } from '../../src/integrations/supabase/types';
import Dashboard from '../features/dashboard/Dashboard';

interface DashboardPageProps {
  onNavigate: (view: ViewState) => void;
  onViewReport: (audit: Tables<'audits'> & { extra_data?: any }) => void;
  onStartAudit: (repoUrl: string, tier: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onViewReport,
  onStartAudit,
}) => {
  return (
    <Dashboard
      onNavigate={onNavigate}
      onViewReport={onViewReport}
      onStartAudit={onStartAudit}
    />
  );
};
