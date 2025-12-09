import React from 'react';
import ReactDOM from 'react-dom';
import { Check } from 'lucide-react';
import { AuditRecord } from '../../../types';
import { TIERS } from '../../common/TierBadges';

interface AuditHistoryDropdownProps {
  auditsByTier: Record<string, AuditRecord[]>;
  historyDropdownOpen: string | null;
  dropdownPosition: { top: number; left: number } | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  formatDate: (dateStr: string) => string;
  onSelectAudit: (audit: AuditRecord) => void;
  onCloseDropdown: () => void;
  onRunTier?: (tier: string, repoUrl: string) => void;
  repoName: string;
}

export const AuditHistoryDropdown: React.FC<AuditHistoryDropdownProps> = ({
  auditsByTier,
  historyDropdownOpen,
  dropdownPosition,
  dropdownRef,
  formatDate,
  onSelectAudit,
  onCloseDropdown,
  onRunTier,
  repoName,
}) => {
  if (!historyDropdownOpen || !dropdownPosition || !auditsByTier[historyDropdownOpen]) {
    return null;
  }

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="fixed w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] p-2 max-h-96 overflow-y-auto"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
      }}
    >
      <div className="text-xs font-medium text-slate-500 px-3 py-2 border-b border-slate-100 mb-1">
        Audit History
      </div>
      {auditsByTier[historyDropdownOpen].map((audit) => {
        const isCurrentAudit = audit.id === historyDropdownOpen;
        return (
          <button
            key={audit.id}
            onClick={() => {
              onSelectAudit(audit);
              onCloseDropdown();
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${isCurrentAudit
              ? 'bg-slate-100'
              : 'hover:bg-slate-50'
              }`}
          >
            <div className="flex items-center gap-3">
              {isCurrentAudit && <Check className="w-4 h-4 text-emerald-500" />}
              <div>
                <span className="text-sm text-slate-700 block">
                  {formatDate(audit.created_at)}
                </span>
              </div>
            </div>
            <span className={`text-sm font-semibold ${(audit.health_score || 0) > 80 ? 'text-emerald-600' :
              (audit.health_score || 0) > 60 ? 'text-amber-600' : 'text-red-600'
              }`}>
              {audit.health_score || 0}/100
            </span>
          </button>
        );
      })}
      {/* Re-run audit button */}
      {onRunTier && (
        <>
          <div className="border-t border-slate-100 my-2" />
          {(() => {
            const tier = TIERS.find(t => t.id === historyDropdownOpen);
            if (!tier) return null;
            const Icon = tier.icon;
            return (
              <button
                onClick={() => {
                  onRunTier(tier.id, `https://github.com/${repoName}`);
                  onCloseDropdown();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-50 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-700 block">Run New Audit</span>
                  <span className="text-xs text-slate-500">{tier.price}</span>
                </div>
              </button>
            );
          })()}
        </>
      )}
    </div>,
    document.body
  );
};
