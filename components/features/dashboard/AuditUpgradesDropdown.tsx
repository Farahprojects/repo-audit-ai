import React from 'react';
import ReactDOM from 'react-dom';
import { TIERS, AuditTier } from '../../common/TierBadges';

interface AuditUpgradesDropdownProps {
  upgradesDropdownOpen: boolean;
  dropdownPosition: { top: number; left: number } | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  completedTiers: string[];
  onRunTier: (tier: AuditTier, repoUrl: string) => void;
  onCloseDropdown: () => void;
  repoName: string;
}

export const AuditUpgradesDropdown: React.FC<AuditUpgradesDropdownProps> = ({
  upgradesDropdownOpen,
  dropdownPosition,
  dropdownRef,
  completedTiers,
  onRunTier,
  onCloseDropdown,
  repoName,
}) => {
  if (!upgradesDropdownOpen || !dropdownPosition) {
    return null;
  }

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="fixed w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-[9999] p-3 max-h-96 overflow-y-auto"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
      }}
    >
      <div className="text-xs font-medium text-slate-500 px-2 py-2 mb-1">
        Select Audit Type
      </div>
      <div className="space-y-1">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const isCompleted = completedTiers.includes(tier.id);
          return (
            <button
              key={tier.id}
              onClick={() => {
                onRunTier(tier.id as AuditTier, `https://github.com/${repoName}`);
                onCloseDropdown();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left group"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isCompleted ? 'bg-emerald-100 group-hover:bg-emerald-200' : 'bg-slate-100 group-hover:bg-slate-200'
                }`}>
                <Icon className={`w-5 h-5 ${isCompleted ? 'text-emerald-600' : 'text-slate-600'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{tier.name}</span>
                  {isCompleted && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      ✓ Run before
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{tier.price}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
