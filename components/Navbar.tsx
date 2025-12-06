import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, User, LogOut, ChevronDown } from 'lucide-react';
import { ViewState } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface NavbarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onSignInClick: () => void;
  user: SupabaseUser | null;
  onSignOut: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onSignInClick, user, onSignOut }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: { id: ViewState; label: string }[] = [
    { id: 'landing', label: 'Home' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'about', label: 'Mission' },
    { id: 'contact', label: 'Contact' },
  ];

  const userNavItems: { id: ViewState; label: string; requiresAuth: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', requiresAuth: true },
  ];

  const handleNavClick = (view: ViewState) => {
    onNavigate(view);
    setIsMenuOpen(false);
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 border-b ${
      isMenuOpen ? 'bg-white border-transparent' : 'bg-white/80 backdrop-blur-xl border-slate-100'
    }`}>
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Logo */}
        <div
          onClick={() => handleNavClick('landing')}
          className="flex items-center gap-3 cursor-pointer group z-50 relative"
        >
          <img
            src="/favicon-192x192.png"
            alt="SCAI Logo"
            className="w-8 h-8 group-hover:scale-105 transition-transform"
          />
          <span className="text-slate-900 font-bold text-xl tracking-tight">SCAI</span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-slate-100 text-slate-900' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="font-medium truncate max-w-[120px]">{user.email}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                  <button
                    onClick={() => {
                      onNavigate('dashboard');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Dashboard
                  </button>
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={() => {
                      onSignOut();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
               onClick={onSignInClick}
               className="text-slate-600 hover:text-slate-900 text-sm font-medium px-4"
            >
              Log in
            </button>
          )}
          <button 
            onClick={() => onNavigate('landing')}
            className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-2.5 rounded-full text-sm font-semibold transition-all shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5"
          >
            Run Audit
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden text-slate-900 z-50 relative p-2"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Mobile Menu Overlay */}
        {isMenuOpen && (
          <div className="fixed inset-0 bg-white z-40 flex flex-col pt-24 px-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-200 overflow-y-auto">
            <div className="flex flex-col gap-2 pb-10">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`text-left font-semibold text-2xl py-4 border-b border-slate-100 ${
                    currentView === item.id 
                      ? 'text-primary' 
                      : 'text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="pt-8 flex flex-col gap-4">
                {user ? (
                  <>
                    <div className="text-center text-slate-600 text-sm mb-2">
                      Signed in as <span className="font-medium">{user.email}</span>
                    </div>
                    <button 
                      onClick={() => { onSignOut(); setIsMenuOpen(false); }}
                      className="w-full py-4 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-50 font-medium flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => { onSignInClick(); setIsMenuOpen(false); }}
                    className="w-full py-4 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-50 font-medium"
                  >
                    Log In
                  </button>
                )}
                <button 
                  onClick={() => handleNavClick('landing')}
                  className="w-full py-4 bg-primary text-white rounded-full hover:bg-blue-600 font-bold shadow-lg shadow-primary/20"
                >
                  Run Audit
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </nav>
  );
};

export default Navbar;