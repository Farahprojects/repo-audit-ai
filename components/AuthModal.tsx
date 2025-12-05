import React, { useState } from 'react';
import { X, Github, Mail, ArrowRight, Shield, Loader2 } from 'lucide-react';
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

  const handleSubmit = async (e: React.FormEvent) => {
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
      // Map common Supabase auth errors to friendly messages
      if (message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (message.includes('User already registered')) {
        setError('This email is already registered. Try signing in instead.');
      } else if (message.includes('Email not confirmed')) {
        setError('Please check your email and confirm your account first.');
      } else if (message.includes('Password should be')) {
        setError('Password must be at least 6 characters long.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/10 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200">
        
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-900 transition-colors z-10 bg-slate-50 p-1.5 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/30">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {mode === 'signin' ? 'Welcome Back' : 'Get Started'}
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">
              {mode === 'signin' 
                ? 'Enter your credentials to continue.' 
                : 'Join 10,000+ developers shipping better code.'}
            </p>
          </div>

          {error && (
            <div className={`mb-4 p-3 rounded-xl text-sm ${error.includes('Check your email') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          <button 
            onClick={handleGitHubSignIn}
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2 mb-6 shadow-lg shadow-slate-900/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Github className="w-5 h-5" />}
            Continue with GitHub
          </button>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-xs font-bold uppercase tracking-wider">
              <span className="bg-white px-3 text-slate-400">Or using email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 block ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 pl-10 pr-6 text-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 block ml-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-3 px-6 text-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3.5 rounded-full transition-colors flex items-center justify-center gap-2 mt-4 shadow-lg shadow-primary/25 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>{mode === 'signin' ? 'Sign In' : 'Sign Up'} <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-slate-500 font-medium">
              {mode === 'signin' ? "No account? " : "Have an account? "}
            </span>
            <button 
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
              className="text-primary hover:text-blue-700 font-bold transition-colors"
            >
              {mode === 'signin' ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
