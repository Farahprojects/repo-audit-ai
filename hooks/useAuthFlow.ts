import { useState, useEffect, useMemo, useCallback } from 'react';
import { ViewState } from '../types';

interface UseAuthFlowProps {
  user: any;
  view: ViewState;
  pendingRepoUrl: string | null;
  setPendingRepoUrl: (url: string | null) => void;
  navigate: (view: ViewState) => void;
  setPreviousView: (view: ViewState) => void;
}

export const useAuthFlow = ({
  user,
  view,
  pendingRepoUrl,
  setPendingRepoUrl,
  navigate,
  setPreviousView,
}: UseAuthFlowProps) => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Close auth modal and navigate to dashboard when user logs in
  // Also auto-start audit if there's a pending repo URL
  useEffect(() => {
    if (user) {
      setIsAuthOpen(false);

      // Clean up OAuth hash fragments from URL after successful authentication
      if (window.location.hash && window.location.hash.includes('access_token')) {
        // Remove the hash fragment to clean up the URL
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      // If there's a pending repo URL and we're on landing page, start the audit automatically
      // This prevents unwanted navigation when viewing historical reports
      if (pendingRepoUrl && view === 'landing') {
        setPendingRepoUrl(null);
        setPreviousView('landing');
        navigate('preflight');
        return;
      }

      // Navigate to dashboard if on landing page
      if (view === 'landing') {
        navigate('dashboard');
      }
    }
  }, [user, pendingRepoUrl, navigate, setPreviousView, setPendingRepoUrl, view]);

  const handleSoftStart = useCallback((url: string) => {
    // If not authenticated, store URL and show sign-in
    localStorage.setItem('pendingRepoUrl', url);
    setPendingRepoUrl(url);
    setIsAuthOpen(true);
  }, []);

  const openAuthModal = useCallback(() => setIsAuthOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthOpen(false), []);

  // Return individual values to prevent unnecessary re-renders
  // Components can now selectively subscribe to only the values they need
  return {
    isAuthOpen,
    setIsAuthOpen,
    handleSoftStart,
    openAuthModal,
    closeAuthModal,
  };
};
