import { Shield, Cpu, Layout, Activity } from 'lucide-react';

export const CATEGORIES = [
  { id: 'Overview', label: 'Overview', icon: Activity },
  { id: 'Security', label: 'Security', icon: Shield, color: 'text-critical' },
  { id: 'Performance', label: 'Performance', icon: Cpu, color: 'text-warning' },
  { id: 'Architecture', label: 'Architecture', icon: Layout, color: 'text-success' },
];
