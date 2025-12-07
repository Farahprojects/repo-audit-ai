import { Shield, Cpu, Target, Search, CheckCircle, Clock, XCircle } from 'lucide-react';

// Audit types for the ReportDashboard navigation
export const AUDIT_TYPES = [
  { id: 'shape', label: 'Repo Shape Check', icon: Search, credits: 2 },
  { id: 'conventions', label: 'Senior Conventions', icon: Target, credits: 4 },
  { id: 'performance', label: 'Performance Deep Dive', icon: Cpu, credits: 6 },
  { id: 'security', label: 'Security Audit', icon: Shield, credits: 10 },
];

// Legacy categories for backward compatibility (if needed)
export const CATEGORIES = [
  { id: 'Overview', label: 'Overview', icon: CheckCircle },
  { id: 'Security', label: 'Security', icon: Shield, color: 'text-critical' },
  { id: 'Performance', label: 'Performance', icon: Cpu, color: 'text-warning' },
  { id: 'Architecture', label: 'Architecture', icon: Target, color: 'text-success' },
];
