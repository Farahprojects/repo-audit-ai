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

      // If there's a pending repo URL, start the audit automatically
      if (pendingRepoUrl) {
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

  // Memoize the return object to prevent unnecessary re-renders
  return useMemo(() => ({
    isAuthOpen,
    setIsAuthOpen,
    handleSoftStart,
    openAuthModal,
    closeAuthModal,
  }), [isAuthOpen, setIsAuthOpen, handleSoftStart, openAuthModal, closeAuthModal]);
};
