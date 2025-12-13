import React, { useEffect, useRef, memo } from 'react';
import { LogEntry } from '../../../types';

interface ScannerProps {
  logs: LogEntry[];
  progress: number;
}

const Scanner: React.FC<ScannerProps> = memo(({ logs, progress }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 relative pt-32">
      {/* Top Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-12 items-center">

        {/* Left: Graphic */}
        <div className="flex flex-col items-center justify-center space-y-10">
          <div className="relative w-72 h-72 flex items-center justify-center">
            <div className="absolute inset-0 bg-blue-50 rounded-full blur-3xl animate-pulse"></div>

            <svg className="w-full h-full -rotate-90">
              <circle
                cx="144" cy="144" r="120"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="16"
              />
              <circle
                cx="144" cy="144" r="120"
                fill="none"
                stroke="#2563eb"
                strokeWidth="16"
                strokeDasharray="753"
                strokeDashoffset={753 - (753 * progress) / 100}
                className="transition-all duration-500 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold text-slate-900 tracking-tighter">{Math.round(progress)}%</span>
              <span className="text-primary text-xs font-bold uppercase tracking-widest mt-2 bg-blue-50 px-3 py-1 rounded-full">Status</span>
            </div>
          </div>

          <div className="text-center space-y-3">
            <h3 className="text-slate-900 text-2xl font-bold">Auditing Codebase...</h3>
            <p className="text-slate-500 max-w-xs mx-auto">Connecting to real-time agent swarm.</p>
          </div>
        </div>

        {/* Right: Terminal (High Contrast) */}
        <div className="h-[450px] bg-slate-950 rounded-3xl shadow-2xl shadow-slate-200 flex flex-col font-mono text-sm overflow-hidden relative border border-slate-900">
          <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center gap-2">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            </div>
            <span className="text-slate-500 ml-4 text-xs font-medium opacity-50">agent_stream.sh</span>
          </div>

          <div className="flex-1 p-6 overflow-y-auto space-y-3 scrollbar-hide">
            {logs.length === 0 && (
              <div className="text-slate-600 italic">Waiting for agents...</div>
            )}
            {logs.map((log, i) => (
              <div key={`${log.timestamp}-${i}`} className="text-slate-400 animate-in fade-in slide-in-from-left-2 duration-300 font-medium">
                <span className="text-slate-700 mr-3 text-xs">
                  {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" })}
                </span>
                {log.message.startsWith('[Error]') ? (
                  <span className="text-red-400 font-bold">{log.message}</span>
                ) : log.message.includes('Success') ? (
                  <span className="text-emerald-400">{log.message}</span>
                ) : (
                  <span>{log.message}</span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
            {progress < 100 && (
              <div className="w-2.5 h-5 bg-blue-500 animate-pulse inline-block mt-1"></div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
});

Scanner.displayName = 'Scanner';

export default Scanner;
