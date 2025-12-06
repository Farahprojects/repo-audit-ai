import React from 'react';
import { Github, Shield, Eye, Trash2 } from 'lucide-react';

interface GitHubConnectModalProps {
    repoUrl: string;
    onConnect: () => void;
    onCancel: () => void;
    isConnecting?: boolean;
}

const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({
    repoUrl,
    onConnect,
    onCancel,
    isConnecting = false,
}) => {
    // Extract repo name for display
    const repoName = repoUrl.split('/').slice(-2).join('/');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl shadow-slate-200 overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 py-10 text-center relative overflow-hidden">
                    {/* Subtle grid pattern */}
                    <div className="absolute inset-0 opacity-10" style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                        backgroundSize: '24px 24px'
                    }}></div>

                    <div className="relative">
                        <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-white/20">
                            <Github className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Private Repository Detected</h2>
                        <p className="text-slate-400 text-sm font-mono bg-slate-800/50 px-3 py-1 rounded-full inline-block">
                            {repoName}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="px-8 py-8">
                    <p className="text-slate-600 text-center mb-8 leading-relaxed">
                        Connect your GitHub account to grant <strong className="text-slate-900">one-time read access</strong> for this audit.
                    </p>

                    {/* Trust Signals */}
                    <div className="space-y-3 mb-8">
                        <div className="flex items-start gap-3 text-sm">
                            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Eye className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900">Read-only access</p>
                                <p className="text-slate-500 text-xs">We only request permission to read repository contents</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 text-sm">
                            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Trash2 className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900">Nothing stored</p>
                                <p className="text-slate-500 text-xs">Your code is analyzed in memory and immediately discarded</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 text-sm">
                            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Shield className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900">Secure & ephemeral</p>
                                <p className="text-slate-500 text-xs">Token expires automatically. Revoke anytime in GitHub settings.</p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                        <button
                            onClick={onConnect}
                            disabled={isConnecting}
                            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
                        >
                            {isConnecting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <Github className="w-5 h-5" />
                                    Connect GitHub
                                </>
                            )}
                        </button>

                        <button
                            onClick={onCancel}
                            disabled={isConnecting}
                            className="w-full py-3 text-slate-500 hover:text-slate-900 font-medium transition-colors"
                        >
                            Try a different repository
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
                    <p className="text-xs text-slate-400 text-center">
                        By connecting, you agree to our{' '}
                        <a href="#" className="text-slate-600 hover:text-slate-900 underline">Privacy Policy</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GitHubConnectModal;
