import React, { useState, useEffect } from 'react';
import { X, Database, Key, Server, Globe } from 'lucide-react';

export type ConnectProvider = 'supabase' | 'firebase' | 'postgres' | 'mysql' | 'planetscale' | 'neon' | 'generic';

interface UniversalConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (config: any) => void;
    provider: ConnectProvider;
    isLoading?: boolean;
}

export const UniversalConnectModal: React.FC<UniversalConnectModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    provider,
    isLoading
}) => {
    const [formData, setFormData] = useState<Record<string, string>>({});

    useEffect(() => {
        setFormData({});
    }, [provider, isOpen]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    if (!isOpen) return null;

    const renderFields = () => {
        switch (provider) {
            case 'supabase':
                return (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Project URL</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="https://xyz.supabase.co"
                                    value={formData.url || ''}
                                    onChange={e => handleChange('url', e.target.value)}
                                    className="w-full pl-9 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Service Role Key</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="password"
                                    placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                                    value={formData.key || ''}
                                    onChange={e => handleChange('key', e.target.value)}
                                    className="w-full pl-9 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">
                                Used once for deep inspection (RLS, Auth, Functions) and discarded.
                            </p>
                        </div>
                    </>
                );

            case 'firebase':
                return (
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Service Account JSON</label>
                        <textarea
                            placeholder='{ "type": "service_account", "project_id": ... }'
                            value={formData.serviceAccount || ''}
                            onChange={e => handleChange('serviceAccount', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono h-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            Paste the full JSON content of your service account key.
                        </p>
                    </div>
                );

            case 'planetscale':
            case 'neon':
            case 'postgres':
            case 'mysql':
            case 'generic':
                return (
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Connection String</label>
                        <div className="relative">
                            <Server className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                type="password"
                                placeholder={provider === 'postgres' ? "postgresql://user:pass@host/db" : "mysql://user:pass@host/db"}
                                value={formData.connectionString || ''}
                                onChange={e => handleChange('connectionString', e.target.value)}
                                className="w-full pl-9 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                            Standard {provider === 'mysql' || provider === 'planetscale' ? 'MySQL' : 'PostgreSQL'} connection string.
                        </p>
                    </div>
                );

            default:
                return null;
        }
    };

    const getProviderName = (p: string) => {
        switch (p) {
            case 'supabase': return 'Supabase';
            case 'firebase': return 'Firebase';
            case 'planetscale': return 'PlanetScale';
            case 'neon': return 'Neon';
            case 'postgres': return 'PostgreSQL';
            case 'mysql': return 'MySQL';
            default: return 'Database';
        }
    };

    const isFormValid = () => {
        switch (provider) {
            case 'supabase': return !!formData.url && !!formData.key;
            case 'firebase': return !!formData.serviceAccount;
            default: return !!formData.connectionString;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <Database className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Connect {getProviderName(provider)}</h3>
                            <p className="text-xs text-slate-500">Enable deep inspection of your database</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {renderFields()}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit(formData)}
                        disabled={!isFormValid() || isLoading}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all flex items-center gap-2 ${!isFormValid() || isLoading
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-emerald-500/20'
                            }`}
                    >
                        {isLoading ? 'Connecting...' : 'Run Deep Audit'}
                        {!isLoading && <span className="opacity-70">→</span>}
                    </button>
                </div>
            </div>
        </div>
    );
};
