import React from 'react';
import Hero from '../features/landing/Hero';

interface LandingPageProps {
  onAnalyze: (url: string) => void;
  onSoftStart: (url: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onAnalyze, onSoftStart }) => {
  return <Hero onAnalyze={onAnalyze} onSoftStart={onSoftStart} />;
};
