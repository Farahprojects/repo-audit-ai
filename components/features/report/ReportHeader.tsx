import React from 'react';
import { GitBranch, Download, Share2, Check, ChevronDown, Clock, Plus } from 'lucide-react';
import { RepoReport, AuditRecord } from '../../../types';
import { TIERS, AuditTier } from '../../common/TierBadges';

interface ReportHeaderProps {
  data: RepoReport;
  relatedAudits: AuditRecord[];
  auditsByTier: Record<string, AuditRecord[]>;
  completedTiers: string[];
  activeTier: string;
  historyDropdownOpen: string | null;
  upgradesDropdownOpen: boolean;
  copied: boolean;
  onTierClick: (tierId: string, buttonElement: HTMLButtonElement) => void;
  onUpgradesClick: () => void;
  onShare: () => void;
  onExportCSV: () => void;
  onRunTier?: (tier: AuditTier, repoUrl: string, config?: any) => void;
  tierButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  upgradesButtonRef: React.RefObject<HTMLButtonElement>;
}

const riskBadgeColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  data,
  auditsByTier,
  completedTiers,
  activeTier,
  historyDropdownOpen,
  upgradesDropdownOpen,
  copied,
  onTierClick,
  onUpgradesClick,
  onShare,
  onExportCSV,
  onRunTier,
  tierButtonRefs,
  upgradesButtonRef,
}) => {
  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-border sticky top-0 z-10 px-8 py-4 print:static print:border-none">
      {/* Top Row: Repo Info */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold text-foreground">
          {data.repoName}
        </h1>
      </div>

      {/* Second Row: Branch Info */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <GitBranch className="w-3 h-3" />
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">main</span>
        <span>•</span>
        <span>Last scanned just now</span>
      </div>

      {/* Third Row: Tier Navigation + Actions */}
      <div className="flex items-center justify-between relative">
        {/* Tier Tabs - Left */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {/* Completed tier tabs */}
          {TIERS.filter(tier => completedTiers.includes(tier.id)).map((tier) => {
            const Icon = tier.icon;
            const auditCount = auditsByTier[tier.id]?.length || 0;
            const isActive = activeTier === tier.id;

            return (
              <button
                key={tier.id}
                ref={(el) => { tierButtonRefs.current[tier.id] = el; }}
                onClick={(e) => onTierClick(tier.id, e.currentTarget)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tier.shortName}
                {auditCount > 1 && (
                  <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                    <Clock className="w-2.5 h-2.5" />
                    {auditCount}
                  </span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${historyDropdownOpen === tier.id ? 'rotate-180' : ''}`} />
              </button>
            );
          })}

          {/* Add Audit Type Button - Shows all tiers */}
          {onRunTier && (
            <div className="relative inline-block ml-1">
              <button
                ref={upgradesButtonRef}
                onClick={onUpgradesClick}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${upgradesDropdownOpen
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
              >
                <Plus className="w-4 h-4" />
                Run Audit
                <ChevronDown className={`w-3 h-3 transition-transform ${upgradesDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons - Far Right */}
        <div className="flex items-center gap-1 print:hidden">
          <button
            onClick={onExportCSV}
            className="p-2 text-slate-400 hover:text-foreground hover:bg-slate-50 rounded-md transition-all"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
