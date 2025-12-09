import React from 'react';
import { Target, Users, Code2 } from 'lucide-react';

const About: React.FC = () => {
  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            The AI Senior Engineer
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto">
            Every developer deserves a world-class mentor, security auditor, and architect looking over their shoulder—without the ego.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-24">
          {[
            { label: 'Repos Audited', val: '10k+' },
            { label: 'Lines of Code', val: '1.2M' },
            { label: 'Uptime', val: '99.9%' },
            { label: 'Support', val: '24/7' },
          ].map((stat, i) => (
             <div key={i} className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100">
                <div className="text-3xl font-bold text-slate-900 mb-1">{stat.val}</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">{stat.label}</div>
             </div>
          ))}
        </div>

        {/* Values */}
        <div className="space-y-16">
           {[
             { 
               icon: Target, 
               title: 'Precision over Speed', 
               desc: "We tune our agents to act like a senior engineer: if it's not a real problem, we don't flag it." 
             },
             { 
               icon: Code2, 
               title: 'Code is Craft', 
               desc: "We respect the artistry of coding. SCAI doesn't just look for bugs; it looks for elegance." 
             },
             { 
               icon: Users, 
               title: 'For Teams, By Teams', 
               desc: "Built by ex-FAANG engineers who got tired of reviewing PRs at 2 AM." 
             }
           ].map((val, i) => (
             <div key={i} className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0 mx-auto md:mx-0">
                  <val.icon className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center md:text-left">
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">{val.title}</h3>
                  <p className="text-slate-500 text-lg leading-relaxed">{val.desc}</p>
                </div>
             </div>
           ))}
        </div>

        {/* Team */}
        <div className="mt-24 border-t border-slate-100 pt-16">
            <h2 className="text-2xl font-bold text-slate-900 mb-10 text-center">Core Team</h2>
            <div className="grid md:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white border border-slate-200 p-8 rounded-3xl text-center hover:shadow-lg transition-all">
                        <div className="w-24 h-24 bg-slate-100 rounded-full mx-auto mb-6 overflow-hidden">
                           <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-white"></div>
                        </div>
                        <h4 className="text-slate-900 font-bold text-lg">Engineer {i}</h4>
                        <p className="text-xs text-primary font-bold uppercase tracking-wider mt-1">Co-Founder</p>
                    </div>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};

export default About;