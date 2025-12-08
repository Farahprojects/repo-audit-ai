import React, { useState, useCallback } from 'react';
import { X, Github, Mail, ArrowRight, Loader2, Apple, Linkedin } from 'lucide-react';
import { supabase } from '../src/integrations/supabase/client';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        setError('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onClose();
      }
    } catch (err: any) {
      const message = err.message || 'An error occurred';
      if (message.includes('Invalid login credentials')) {
        setError('Invalid email or password.');
      } else if (message.includes('User already registered')) {
        setError('Email already registered.');
      } else if (message.includes('Email not confirmed')) {
        setError('Please verify your email first.');
      } else if (message.includes('Password should be')) {
        setError('Password must be 6+ characters.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, onClose]);

  const signInWithProvider = async (provider: 'google' | 'github' | 'apple') => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white w-full max-w-[360px] rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all relative">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-300 hover:text-slate-600 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-8 pt-8 pb-8">

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-500 text-xs mt-1.5 font-medium">
              {mode === 'signin'
                ? 'Sign in to access your dashboard'
                : 'Start auditing your code in seconds'}
            </p>
          </div>

          {/* Social Buttons Row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => signInWithProvider('google')}
              disabled={loading}
              className="flex items-center justify-center py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <GoogleIcon />}
            </button>
            <button
              onClick={() => signInWithProvider('github')}
              disabled={loading}
              className="flex items-center justify-center py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <Github className="w-5 h-5 text-slate-900" />}
            </button>
            <button
              onClick={() => signInWithProvider('apple')}
              disabled={loading}
              className="flex items-center justify-center py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" /> : <Apple className="w-5 h-5 text-slate-900" />}
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider">
              <span className="bg-white px-3 text-slate-400">Or continue with</span>
            </div>
          </div>

          {error && (
            <div className={`mb-4 p-3 rounded-lg text-xs leading-relaxed text-center ${error.includes('Check your email') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {error}
            </div>
          )}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative group">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-transparent focus:bg-white focus:border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400"
                placeholder="Email address"
                required
              />
            </div>

            <div className="relative group">
              <div className="absolute left-3.5 top-3 w-4 h-4 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-slate-400 group-focus-within:bg-slate-600 mr-0.5"></div>
                <div className="w-1 h-1 rounded-full bg-slate-400 group-focus-within:bg-slate-600 mr-0.5"></div>
                <div className="w-1 h-1 rounded-full bg-slate-400 group-focus-within:bg-slate-600"></div>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-transparent focus:bg-white focus:border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 text-sm focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400"
                placeholder="Password"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 hover:bg-black text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 shadow-sm active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>{mode === 'signin' ? 'Sign In' : 'Create Account'}</>
              )}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
            className="w-full mt-6 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            {mode === 'signin' ? (
              <>Don't have an account? <span className="font-semibold underline">Sign up</span></>
            ) : (
              <>Already have an account? <span className="font-semibold underline">Log in</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
