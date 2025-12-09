import React from 'react';
import { Check, X, Zap } from 'lucide-react';

const Pricing: React.FC = () => {
  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed">
            Stop paying for technical debt. Start paying for solutions.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 md:gap-8">
          
          {/* Starter Plan */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col hover:border-slate-300 transition-colors shadow-sm">
            <div className="mb-8">
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Hobby</span>
              <h3 className="text-2xl font-bold text-slate-900 mt-4 mb-2">Developer</h3>
              <p className="text-slate-500 text-sm">For solo maintainers.</p>
              <div className="mt-6 flex items-baseline">
                <span className="text-5xl font-bold text-slate-900">$0</span>
                <span className="text-slate-400 ml-2 font-medium">/mo</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              {[
                  '1 Repository Audit', 
                  'Basic Security Scan', 
                  'Public Repos Only'
              ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-slate-600" />
                    </div>
                    {item}
                  </li>
              ))}
              <li className="flex items-center gap-3 text-slate-400 text-sm">
                 <div className="w-5 h-5 rounded-full bg-slate-50 flex items-center justify-center flex-shrink-0">
                    <X className="w-3 h-3 text-slate-300" />
                 </div>
                 AI Fix Suggestions
              </li>
            </ul>

            <button className="w-full py-4 border border-slate-200 text-slate-900 rounded-full hover:bg-slate-50 transition-colors font-bold text-sm">
              Start for Free
            </button>
          </div>

          {/* Pro Plan */}
          <div className="bg-slate-900 rounded-3xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-slate-900/20">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-primary to-blue-500 text-white px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
              Most Popular
            </div>
            <div className="mb-8 mt-2">
              <span className="bg-slate-800 text-blue-200 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Growth</span>
              <h3 className="text-2xl font-bold text-white mt-4 mb-2">Team</h3>
              <p className="text-slate-400 text-sm">For shipping faster.</p>
              <div className="mt-6 flex items-baseline">
                <span className="text-5xl font-bold text-white">$49</span>
                <span className="text-slate-500 ml-2 font-medium">/mo</span>
              </div>
            </div>
            
            <ul className="space-y-4 mb-10 flex-1">
               {[
                  'Unlimited Audits', 
                  'Private Repositories', 
                  'Architectural Analysis',
                  'Auto-Fix Pull Requests',
                  'CI/CD Integration'
              ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                    </div>
                    {item}
                  </li>
              ))}
            </ul>

            <button className="w-full py-4 bg-primary text-white rounded-full hover:bg-blue-600 transition-colors font-bold text-sm shadow-lg shadow-primary/25">
              Get Started
            </button>
          </div>

          {/* Enterprise Plan */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col hover:border-slate-300 transition-colors shadow-sm">
            <div className="mb-8">
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Scale</span>
              <h3 className="text-2xl font-bold text-slate-900 mt-4 mb-2">Enterprise</h3>
              <p className="text-slate-500 text-sm">For compliance & security.</p>
              <div className="mt-6 flex items-baseline">
                <span className="text-5xl font-bold text-slate-900">Custom</span>
              </div>
            </div>
            
             <ul className="space-y-4 mb-8 flex-1">
               {[
                  'On-Premise Deployment', 
                  'SSO & SAML', 
                  'SOC2 Reports',
                  'Dedicated Manager'
              ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600 text-sm font-medium">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-slate-600" />
                    </div>
                    {item}
                  </li>
              ))}
            </ul>

            <button className="w-full py-4 border border-slate-200 text-slate-900 rounded-full hover:bg-slate-50 transition-colors font-bold text-sm">
              Contact Sales
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Pricing;