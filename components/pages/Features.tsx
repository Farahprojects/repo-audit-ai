import React from 'react';
import { Shield, Cpu, Layout, Zap, TrendingUp, Database, CheckCircle, ArrowRight } from 'lucide-react';

// Static data moved outside component to prevent recreation on every render
const CORE_FEATURES = [
  {
    icon: Shield,
    title: 'Security Shield',
    description: 'Detects vulnerabilities, hardcoded secrets, and outdated dependencies instantly. Your code stays secure from day one.',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  },
  {
    icon: Cpu,
    title: 'Performance Hunter',
    description: 'Identifies N+1 queries, memory leaks, and unoptimized rendering patterns. Keep your applications fast and efficient.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200'
  },
  {
    icon: Layout,
    title: 'Architecture Zen',
    description: 'Analyzes code coupling, complexity, and file structure for long-term health. Build scalable, maintainable systems.',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  }
];

const AUDIT_TIERS = [
  {
    icon: Layout,
    name: 'Shape Check',
    shortName: 'Shape',
    headline: 'Get the Big Picture',
    description: 'Understanding your codebase architecture is the foundation of good development. Know what you\'re working with before making decisions.',
    importance: 'Quick architectural overview helps you understand scale, complexity, and potential risks before investing time and resources.'
  },
  {
    icon: Zap,
    name: 'Senior Check',
    shortName: 'Senior',
    headline: 'Code Like a Senior Engineer',
    description: 'Get insights that take years to develop. Identify patterns, anti-patterns, and improvements that elevate your code quality.',
    importance: 'Senior-level code review catches issues that junior reviews miss, ensuring your codebase follows industry best practices.'
  },
  {
    icon: TrendingUp,
    name: 'Performance Audit',
    shortName: 'Perf',
    headline: 'Speed Matters to Users',
    description: 'Slow applications lose users. Identify bottlenecks, optimize queries, and improve response times before they impact your business.',
    importance: 'Performance issues compound over time. Early optimization saves thousands in infrastructure costs and keeps users engaged.'
  },
  {
    icon: Shield,
    name: 'Security Audit',
    shortName: 'Security',
    headline: 'Protect What Matters',
    description: 'Security breaches can destroy businesses. Find vulnerabilities, misconfigurations, and weak points before attackers do.',
    importance: 'One security breach can cost millions and damage reputation. Proactive security saves money and builds user trust.'
  },
  {
    icon: Database,
    name: 'Supabase Deep Dive',
    shortName: 'Supabase',
    headline: 'Database Security & Performance',
    description: 'Your database holds your most valuable data. Ensure RLS policies are correct, queries are optimized, and your schema is secure.',
    importance: 'Database issues affect everything. Proper configuration prevents data breaches and ensures your app scales efficiently.'
  }
];

const BENEFITS = [
  'Instant automated code review',
  '24/7 senior engineer availability',
  'Security vulnerability detection',
  'Performance optimization insights',
  'Architecture recommendations',
  'Best practices enforcement',
  'CI/CD integration ready',
  'Team collaboration tools'
];

const Features: React.FC = () => {

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-6 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            AI-Powered Code Auditing
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed max-w-3xl mx-auto">
            Experience the future of code review with SCAI's comprehensive auditing platform.
            Get senior-level insights, security analysis, and performance optimization in minutes.
          </p>
        </div>

        {/* Core Features */}
        <div className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Core Capabilities</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {CORE_FEATURES.map((feature, index) => (
              <div key={index} className="group bg-surface p-8 rounded-2xl border border-border hover:border-slate-300 transition-all hover:shadow-lg">
                <div className={`w-14 h-14 ${feature.bgColor} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">{feature.title}</h3>
                <p className="text-slate-500 text-base leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Tiers */}
        <div className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">Choose Your Audit Depth</h2>
          <p className="text-slate-500 text-center mb-12 max-w-2xl mx-auto">Each audit level builds on the previous, giving you increasingly comprehensive insights into your codebase health.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {AUDIT_TIERS.map((tier, index) => (
              <div key={index} className="group bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                    <tier.icon className="w-6 h-6 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{tier.name}</h3>
                    <span className="text-sm text-slate-500 font-medium">{tier.shortName}</span>
                  </div>
                </div>

                <h4 className="text-lg font-semibold text-slate-800 mb-4">{tier.headline}</h4>

                <p className="text-slate-600 text-base mb-6 leading-relaxed">{tier.description}</p>

                {/* Importance section */}
                <div className="bg-slate-50 border-l-4 border-slate-300 p-4 mb-6 rounded-r-lg">
                  <p className="text-slate-700 text-sm leading-relaxed italic">"{tier.importance}"</p>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Why Choose SCAI?</h2>
          <div className="bg-slate-50 rounded-3xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-6">
              {BENEFITS.map((benefit, index) => (
                <div key={index} className="flex items-center gap-4">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span className="text-slate-700 font-medium">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to Audit Your Code?</h2>
          <p className="text-xl text-slate-500 mb-8 max-w-2xl mx-auto">
            Start with a free Shape Check or upgrade to comprehensive audits.
            Your next senior engineer is waiting.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-slate-900 text-white hover:bg-black px-8 py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2">
              Start Free Audit <ArrowRight className="w-5 h-5" />
            </button>
            <button className="border border-slate-200 text-slate-700 hover:bg-slate-50 px-8 py-4 rounded-xl font-semibold text-lg transition-all">
              View Pricing
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Features;
