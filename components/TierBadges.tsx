import React from 'react';
import { Check, Play, Zap, Shield, ChevronRight, Layers } from 'lucide-react';

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
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50 flex flex-col items-center text-center">
                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-emerald-900">All Audits Complete</p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center">
                    <Play className="w-3 h-3 text-white" />
                </div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Run New Audit
                </h4>
            </div>

            <div className="space-y-2">
                {TIERS.map((tier) => {
                    const isCompleted = completedTiers.includes(tier.id);
                    // Don't show completed tiers in the upsell list to reduce noise, 
                    // or show them very subtly. Let's hide them to be "intuitive" and focus on what's next.
                    if (isCompleted) return null;

                    const Icon = tier.icon;
                    return (
                        <button
                            key={tier.id}
                            onClick={() => onRunTier(tier.id)}
                            className="w-full group flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all text-left"
                        >
                            <div className="flex items-center gap-2.5">
                                <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
                                <div>
                                    <div className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                                        {tier.shortName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                        {tier.price === 'Free' ? 'Free Audit' : `${tier.price} • Run Now`}
                                    </div>
                                </div>
                            </div>
                            <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                <ChevronRight className="w-3 h-3" />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default TierBadges;
