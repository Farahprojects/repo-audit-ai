import React from 'react';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  // Currently just a pass-through wrapper
  // Can be extended with context providers as needed
  return <>{children}</>;
};
