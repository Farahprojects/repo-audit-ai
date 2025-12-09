import React from 'react';
import { Shield, Cpu, Layout, Zap, TrendingUp, Database, CheckCircle, ArrowRight } from 'lucide-react';

const Features: React.FC = () => {
  const coreFeatures = [
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

  const auditTiers = [
    {
      icon: Layout,
      name: 'Shape Check',
      shortName: 'Shape',
      description: 'Quick architectural overview and basic code quality assessment.',
      price: 'Free',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    {
      icon: Zap,
      name: 'Senior Check',
      shortName: 'Senior',
      description: 'Comprehensive code review with senior-level insights and best practices.',
      price: '$9',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      icon: TrendingUp,
      name: 'Performance Audit',
      shortName: 'Perf',
      description: 'Deep performance analysis including database queries, caching, and optimization opportunities.',
      price: '$19',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    {
      icon: Shield,
      name: 'Security Audit',
      shortName: 'Security',
      description: 'Complete security assessment covering authentication, authorization, and vulnerability detection.',
      price: '$49',
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    },
    {
      icon: Database,
      name: 'Supabase Deep Dive',
      shortName: 'Supabase',
      description: 'Specialized audit for Supabase projects including RLS policies, Edge Functions, and database schema.',
      price: '$50',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    }
  ];

  const benefits = [
    'Instant automated code review',
    '24/7 senior engineer availability',
    'Security vulnerability detection',
    'Performance optimization insights',
    'Architecture recommendations',
    'Best practices enforcement',
    'CI/CD integration ready',
    'Team collaboration tools'
  ];

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
            {coreFeatures.map((feature, index) => (
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
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Audit Depth Options</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auditTiers.map((tier, index) => (
              <div key={index} className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg hover:border-slate-300 transition-all">
                <div className={`w-12 h-12 ${tier.bgColor} rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                  <tier.icon className={`w-6 h-6 ${tier.color}`} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{tier.name}</h3>
                <p className="text-slate-500 text-sm mb-4 leading-relaxed">{tier.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900">{tier.price}</span>
                  <span className={`text-xs font-semibold ${tier.color} bg-slate-100 px-2 py-1 rounded-full`}>
                    {tier.shortName}
                  </span>
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
              {benefits.map((benefit, index) => (
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
