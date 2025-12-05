import React, { useState, useEffect } from 'react';
import { Shield, Menu, X } from 'lucide-react';
import { ViewState } from '../types';

interface NavbarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onSignInClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onSignInClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  const navItems: { id: ViewState; label: string }[] = [
    { id: 'landing', label: 'Home' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'about', label: 'Mission' },
    { id: 'contact', label: 'Contact' },
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
          className="flex items-center gap-2 cursor-pointer group z-50 relative"
        >
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
            <Shield className="w-5 h-5 text-white" />
          </div>
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
          <button 
             onClick={onSignInClick}
             className="text-slate-600 hover:text-slate-900 text-sm font-medium px-4"
          >
            Log in
          </button>
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
                <button 
                  onClick={() => { onSignInClick(); setIsMenuOpen(false); }}
                  className="w-full py-4 text-slate-600 border border-slate-200 rounded-full hover:bg-slate-50 font-medium"
                >
                  Log In
                </button>
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