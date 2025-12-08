import { useState, useEffect, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../src/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      // Clear all localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();

      // Sign out from Supabase
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error during sign out:', error);
      // Still attempt to clear storage even if Supabase sign out fails
      localStorage.clear();
      sessionStorage.clear();
    }
  };

  // Return individual values to prevent unnecessary re-renders
  // Components can now selectively subscribe to only the values they need
  return {
    user,
    session,
    loading,
    signOut,
  };
}
