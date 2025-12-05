import React, { useState } from 'react';
import { Shield, Cpu, Layout, ArrowRight, Github } from 'lucide-react';

interface HeroProps {
  onAnalyze: (url: string) => void;
}

const Hero: React.FC<HeroProps> = ({ onAnalyze }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim().length > 0) {
      onAnalyze(url);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden bg-background pt-32 md:pt-0">
      
      {/* Background Blobs */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-slate-50 to-white -z-10"></div>
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[100px] opacity-60 -z-10 animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-50 rounded-full blur-[100px] opacity-60 -z-10"></div>

      <div className="max-w-4xl w-full text-center z-10 space-y-8 md:space-y-10">
        
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-medium mb-4 shadow-sm border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-success mr-2 animate-pulse"></span>
          SCAI v2.0 is Live
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-slate-900 leading-[1.1] md:leading-[1.1]">
          Your Code. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-600">
            Perfected by AI.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-500 max-w-xl mx-auto px-4 font-medium leading-relaxed">
          The AI Senior Engineer that never sleeps. Instant security, performance, and architecture audits for any codebase.
        </p>

        {/* Input Section */}
        <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto mt-12 relative group px-4">
          <div className="relative flex items-center bg-white rounded-full p-2 border border-slate-200">
            <div className="pl-6 text-slate-400">
              <Github className="w-6 h-6" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/username/repo"
              className="flex-1 bg-transparent border-none text-slate-900 placeholder-slate-400 focus:ring-0 px-4 py-3 text-base md:text-lg outline-none w-full"
            />
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-full font-semibold transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2 whitespace-nowrap"
            >
              Audit <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-slate-400 text-sm mt-4">No credit card required for public repos.</p>
        </form>

        {/* Value Props */}
        <div className="grid md:grid-cols-3 gap-6 md:gap-8 text-left mt-20 px-4">
          <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-100 border border-slate-100 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-6">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-slate-900 font-bold text-lg mb-2">Security Shield</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Detects vulnerabilities, hardcoded secrets, and outdated dependencies instantly.</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-100 border border-slate-100 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-6">
              <Cpu className="w-6 h-6 text-amber-500" />
            </div>
            <h3 className="text-slate-900 font-bold text-lg mb-2">Performance Hunter</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Identifies N+1 queries, memory leaks, and unoptimized rendering patterns.</p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-lg shadow-slate-100 border border-slate-100 hover:shadow-xl transition-shadow">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6">
              <Layout className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-slate-900 font-bold text-lg mb-2">Architecture Zen</h3>
            <p className="text-slate-500 text-sm leading-relaxed">Analyzes code coupling, complexity, and file structure for long-term health.</p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Hero;