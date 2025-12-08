import React, { useState, useCallback } from 'react';
import { Shield, Cpu, Layout, ArrowRight, Github, CheckCircle } from 'lucide-react';

interface HeroProps {
  onAnalyze: (url: string) => void;
  onSoftStart?: (url: string) => void;
}

const Hero: React.FC<HeroProps> = ({ onAnalyze, onSoftStart }) => {
  const [url, setUrl] = useState('');
  const [acceptedUrl, setAcceptedUrl] = useState<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim().length > 0) {
      if (onSoftStart) {
        onSoftStart(url.trim());
        setAcceptedUrl(url.trim());
        setUrl(''); // Clear the input
      } else {
        onAnalyze(url);
      }
    }
  }, [url, onSoftStart, onAnalyze]);

  const handleRunAudit = useCallback(() => {
    if (acceptedUrl) {
      onAnalyze(acceptedUrl);
    }
  }, [acceptedUrl, onAnalyze]);

  const handleChangeUrl = useCallback(() => {
    setAcceptedUrl(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background pt-32">

      {/* Subtle Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-100/50 via-background to-background -z-10"></div>

      <div className="max-w-5xl w-full text-center z-10 space-y-10 md:space-y-12">


        {/* Headline */}
        <div className="space-y-6 animate-slide-up">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground leading-[1.05] md:leading-[1.05]">
            Your Code. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-slate-700 to-slate-900">
              Perfected by AI.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto font-normal leading-relaxed">
            The AI Senior Engineer that never sleeps. Instant security, performance, and architecture audits for any codebase.
          </p>
        </div>

        {/* Input Section or Confirmation */}
        {!acceptedUrl ? (
          <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto mt-12 relative group animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="relative flex items-center bg-white rounded-lg p-1.5 border border-border transition-all focus-within:ring-2 focus-within:ring-slate-100 focus-within:border-slate-300 shadow-sm hover:shadow-md">
              <div className="pl-4 text-slate-400">
                <Github className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="github.com/owner/repository-name"
                className="flex-1 bg-transparent border-none text-foreground placeholder-slate-400 focus:ring-0 px-3 py-3 text-base outline-none w-full font-medium"
              />
              <button
                type="submit"
                className="bg-foreground hover:bg-slate-800 text-background px-6 py-2.5 rounded-md font-medium transition-all flex items-center gap-2 whitespace-nowrap"
              >
                Start Audit <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center text-slate-400 text-xs mt-3">No credit card required for public repos.</p>
          </form>
        ) : (
          <div className="w-full max-w-lg mx-auto mt-12 animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="bg-white rounded-xl border border-border shadow-lg p-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Audit</h3>
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <p className="text-sm font-medium text-slate-700 font-mono">
                    {acceptedUrl.split('/').slice(-2).join('/')}
                  </p>
                </div>
                <button
                  onClick={handleRunAudit}
                  className="w-full bg-foreground hover:bg-slate-800 text-background px-6 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 mb-3"
                >
                  Run Audit <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleChangeUrl}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Change repository
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Value Props */}
        <div className="grid md:grid-cols-3 gap-6 text-left mt-24 px-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="group bg-surface p-6 rounded-xl border border-border hover:border-slate-300 transition-colors">
            <div className="w-10 h-10 bg-white border border-border rounded-lg flex items-center justify-center mb-4 shadow-xs">
              <Shield className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="text-foreground font-semibold text-base mb-2">Security Shield</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Detects vulnerabilities, hardcoded secrets, and outdated dependencies instantly.</p>
          </div>

          <div className="group bg-surface p-6 rounded-xl border border-border hover:border-slate-300 transition-colors">
            <div className="w-10 h-10 bg-white border border-border rounded-lg flex items-center justify-center mb-4 shadow-xs">
              <Cpu className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="text-foreground font-semibold text-base mb-2">Performance Hunter</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Identifies N+1 queries, memory leaks, and unoptimized rendering patterns.</p>
          </div>

          <div className="group bg-surface p-6 rounded-xl border border-border hover:border-slate-300 transition-colors">
            <div className="w-10 h-10 bg-white border border-border rounded-lg flex items-center justify-center mb-4 shadow-xs">
              <Layout className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="text-foreground font-semibold text-base mb-2">Architecture Zen</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Analyzes code coupling, complexity, and file structure for long-term health.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Hero;