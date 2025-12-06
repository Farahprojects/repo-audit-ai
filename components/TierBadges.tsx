import React from 'react';
import { Check, Lock, Zap, Shield, TrendingUp, Layers } from 'lucide-react';

export type AuditTier = 'shape' | 'conventions' | 'performance' | 'security';

interface TierInfo {
    id: AuditTier;
    name: string;
    shortName: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    price: string;
    priceValue: number;
}

export const TIERS: TierInfo[] = [
    {
        id: 'shape',
        name: 'Shape Check',
        shortName: 'Shape',
        icon: Layers,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        price: 'Free',
        priceValue: 0,
    },
    {
        id: 'conventions',
        name: 'Senior Check',
        shortName: 'Senior',
        icon: Zap,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        price: '$9',
        priceValue: 9,
    },
    {
        id: 'performance',
        name: 'Performance Audit',
        shortName: 'Perf',
        icon: TrendingUp,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        price: '$19',
        priceValue: 19,
    },
    {
        id: 'security',
        name: 'Security Audit',
        shortName: 'Security',
        icon: Shield,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        price: '$49',
        priceValue: 49,
    },
];

interface TierBadgesProps {
    completedTiers: string[];
    onUpgrade?: (tier: AuditTier) => void;
    compact?: boolean;
}

const TierBadges: React.FC<TierBadgesProps> = ({
    completedTiers,
    onUpgrade,
    compact = false
}) => {
    return (
        <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
            {TIERS.map((tier) => {
                const isCompleted = completedTiers.includes(tier.id);
                const Icon = tier.icon;

                if (compact) {
                    // Compact mode: small badges
                    return (
                        <div
                            key={tier.id}
                            className={`
                flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                ${isCompleted
                                    ? `${tier.bgColor} ${tier.color}`
                                    : 'bg-slate-100 text-slate-400'}
              `}
                            title={isCompleted ? `${tier.name} ✓` : `${tier.name} - ${tier.price}`}
                        >
                            {isCompleted ? (
                                <Check className="w-3 h-3" />
                            ) : (
                                <Lock className="w-3 h-3" />
                            )}
                            {tier.shortName}
                        </div>
                    );
                }

                // Full mode: clickable cards
                return (
                    <button
                        key={tier.id}
                        onClick={() => !isCompleted && onUpgrade?.(tier.id)}
                        disabled={isCompleted}
                        className={`
              flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
              transition-all border
              ${isCompleted
                                ? `${tier.bgColor} ${tier.color} ${tier.borderColor} cursor-default`
                                : `bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50`}
            `}
                    >
                        {isCompleted ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <Icon className="w-4 h-4" />
                        )}
                        <span>{tier.shortName}</span>
                        {!isCompleted && (
                            <span className="text-xs text-slate-400">{tier.price}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

// Upsell panel for report sidebar
interface TierUpsellPanelProps {
    completedTiers: string[];
    repoUrl: string;
    onRunTier: (tier: AuditTier) => void;
}

export const TierUpsellPanel: React.FC<TierUpsellPanelProps> = ({
    completedTiers,
    repoUrl,
    onRunTier,
}) => {
    const unlockedTiers = TIERS.filter(t => !completedTiers.includes(t.id));

    if (unlockedTiers.length === 0) {
        return (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                    <Check className="w-4 h-4" />
                    All Audits Complete
                </div>
                <p className="text-xs text-emerald-600 mt-1">
                    You've unlocked all insights for this repo.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Unlock More Insights
            </h4>
            <div className="space-y-2">
                {TIERS.map((tier) => {
                    const isCompleted = completedTiers.includes(tier.id);
                    const Icon = tier.icon;

                    return (
                        <div
                            key={tier.id}
                            className={`
                flex items-center justify-between p-3 rounded-xl
                ${isCompleted
                                    ? `${tier.bgColor} ${tier.borderColor} border`
                                    : 'bg-white border border-slate-200'}
              `}
                        >
                            <div className="flex items-center gap-2">
                                {isCompleted ? (
                                    <Check className={`w-4 h-4 ${tier.color}`} />
                                ) : (
                                    <Icon className="w-4 h-4 text-slate-400" />
                                )}
                                <span className={`text-sm font-medium ${isCompleted ? tier.color : 'text-slate-700'}`}>
                                    {tier.shortName}
                                </span>
                            </div>

                            {isCompleted ? (
                                <span className={`text-xs ${tier.color}`}>Done</span>
                            ) : (
                                <button
                                    onClick={() => onRunTier(tier.id)}
                                    className={`
                    text-xs font-semibold px-3 py-1.5 rounded-full
                    ${tier.id === 'shape'
                                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                            : 'bg-slate-900 text-white hover:bg-slate-800'}
                  `}
                                >
                                    {tier.price === 'Free' ? 'Run Free' : `Run ${tier.price}`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TierBadges;
