import React, { useEffect, useRef } from 'react';
import { Github, Eye, Trash2, Lock } from 'lucide-react';
import { supabase } from '../src/integrations/supabase/client';

interface GitHubConnectModalProps {
    repoUrl: string;
    onConnect: () => void;        // Called when user clicks button to start OAuth
    onConnected: () => void;      // Called when polling detects account was created
    onCancel: () => void;
    isConnecting?: boolean;
}

const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({
    repoUrl,
    onConnect,
    onConnected,
    onCancel,
    isConnecting = false,
}) => {
    const pollIntervalRef = useRef<number | null>(null);
    const hasConnectedRef = useRef(false);

    // Poll github_accounts table to detect when OAuth flow completes
    useEffect(() => {
        if (!isConnecting) {
            // Clear any existing poll when not connecting
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
            return;
        }

        // Start polling when connecting
        const pollForAccount = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user?.id) return;

                const { data, error } = await supabase
                    .from('github_accounts')
                    .select('id')
                    .eq('user_id', session.user.id)
                    .maybeSingle();

                if (data && !error && !hasConnectedRef.current) {
                    hasConnectedRef.current = true;
                    
                    // Clear the interval
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                    }
                    
                    // Trigger the onConnected callback (NOT onConnect which starts OAuth)
                    onConnected();
                }
            } catch (err) {
                console.error('[GitHubConnectModal] Polling error:', err);
            }
        };

        // Poll every 500ms
        pollIntervalRef.current = window.setInterval(pollForAccount, 500);

        // Also check immediately
        pollForAccount();

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [isConnecting, onConnected]);

    // Extract repo name for display
    const repoName = repoUrl.split('/').slice(-2).join('/');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-300">
            <div className="bg-white w-full max-w-[380px] rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all">

                <div className="p-8 flex flex-col items-center text-center">
                    {/* Minimal Icon */}
                    <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-slate-900/20">
                        <Github className="w-6 h-6" />
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 mb-2">Connect GitHub</h2>

                    <div className="bg-slate-50 border border-slate-100 px-3 py-1 rounded-full mb-6 max-w-full truncate">
                        <p className="text-xs font-semibold text-slate-500 font-mono">
                            {repoName}
                        </p>
                    </div>

                    <p className="text-sm text-slate-500 mb-8 leading-relaxed px-2">
                        This repository is private. Grant one-time <strong className="text-slate-900">read access</strong> to generate your audit.
                    </p>

                    {/* Compact Trust Grid */}
                    <div className="grid grid-cols-3 gap-2 w-full mb-8">
                        <div className="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <Eye className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-medium text-slate-500">Read-only</span>
                        </div>
                        <div className="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <Trash2 className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-medium text-slate-500">Ephemeral</span>
                        </div>
                        <div className="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <Lock className="w-5 h-5 text-slate-400" />
                            <span className="text-[10px] font-medium text-slate-500">Secure</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="w-full space-y-3">
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            className="w-full py-3 bg-slate-900 hover:bg-black text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                        >
                            {isConnecting ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Waiting for GitHub...
                                </>
                            ) : (
                                'Authorize Access'
                            )}
                        </button>

                        <button
                            onClick={onCancel}
                            disabled={isConnecting}
                            className="w-full py-2.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GitHubConnectModal;
