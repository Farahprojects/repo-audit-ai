import React from 'react';
import { Database, Zap, Shield, Layers, Key, Check, Server, Globe } from 'lucide-react';
import { RepoReport } from '../types';

interface DeepAuditUpsellProps {
    report: RepoReport;
    onRunDeepAudit: (type: string, provider: string) => void;
}

export const DeepAuditUpsell: React.FC<DeepAuditUpsellProps> = ({ report, onRunDeepAudit }) => {
    const stack = report.detectedStack;

    // Define all possible deep audits
    const options = [
        {
            id: 'supabase_deep_dive',
            provider: 'supabase',
            title: 'Supabase Deep Audit',
            description: 'Analyze RLS policies, Edge Functions, and database schema security.',
            icon: Database,
            relevant: stack?.supabase,
            price: '$50',
        },
        {
            id: 'firebase_audit',
            provider: 'firebase',
            title: 'Firebase Security Audit',
            description: 'Check Firestore rules, Auth configuration, and Function permissions.',
            icon: Zap,
            relevant: stack?.firebase,
            price: '$50',
        },
        {
            id: 'neon_postgres_audit',
            provider: 'neon',
            title: 'Neon Postgres Audit',
            description: 'Performance tuning, branching best practices, and serverless driver checks.',
            icon: Server,
            relevant: stack?.neon || stack?.prisma || stack?.drizzle, // Assume Neon/Modern Postgres for Prisma/Drizzle if not specific
            price: '$45',
        },
        {
            id: 'planetscale_audit',
            provider: 'planetscale',
            title: 'PlanetScale Check',
            description: 'Schema review, foreign key constraints (or lack thereof), and sharding analysis.',
            icon: Globe,
            relevant: stack?.planetscale,
            price: '$45',
        },
        {
            id: 'generic_postgres_audit',
            provider: 'postgres',
            title: 'PostgreSQL Deep Dive',
            description: 'General analyze of schema, indexes, and query performance.',
            icon: Database,
            relevant: false, // Always show "Other"? Or only if nothing else matches?
            price: '$40',
        },
    ];

    // Logic: Show relevant ones. If none relative, maybe show generic? 
    // User said: "Each one is only shown if relevant."
    const relevantOptions = options.filter(o => o.relevant);

    if (relevantOptions.length === 0) return null;

    return (
        <div className="mt-8 animate-fade-in">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-500" />
                Recommended Deep Audits
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {relevantOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                        <div key={option.id} className="group relative bg-white border border-indigo-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-300 overflow-hidden">
                            <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-bl-lg">
                                Recommended
                            </div>

                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <Icon className="w-5 h-5 text-indigo-600" />
                            </div>

                            <h4 className="font-semibold text-foreground mb-1">{option.title}</h4>
                            <p className="text-sm text-slate-500 mb-4 line-clamp-2 h-10">{option.description}</p>

                            <div className="flex items-center justify-between mt-auto">
                                <span className="font-mono text-sm font-semibold text-slate-700">{option.price}</span>
                                <button
                                    onClick={() => onRunDeepAudit(option.id, option.provider)}
                                    className="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"
                                >
                                    Start Audit
                                    <span className="opacity-70">→</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
