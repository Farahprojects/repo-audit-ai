import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, X, User, LogOut, ChevronDown, Trash2 } from 'lucide-react';
import { ViewState } from '../../types';
import { User as SupabaseUser } from '@supabase/supabase-js';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import { deleteService } from '../../services/deleteService';

interface NavbarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  onSignInClick: () => void;
  user: SupabaseUser | null;
  onSignOut: () => void;
  onLogoClick?: () => void;
}

// Static navigation data moved outside component to prevent recreation on every render
const NAV_ITEMS: { id: ViewState; label: string }[] = [
  { id: 'pricing', label: 'Pricing' },
  { id: 'features', label: 'Features' },
  { id: 'about', label: 'Mission' },
  { id: 'contact', label: 'Contact' },
  { id: 'legal', label: 'Legal' },
];

const USER_NAV_ITEMS: { id: ViewState; label: string; requiresAuth: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', requiresAuth: true },
];

const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onSignInClick, user, onSignOut, onLogoClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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

  const handleNavClick = useCallback((view: ViewState) => {
    onNavigate(view);
    setIsMenuOpen(false);
  }, [onNavigate]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-border transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <div
          onClick={() => onLogoClick ? onLogoClick() : handleNavClick(user ? 'dashboard' : 'landing')}
          className="flex items-center gap-2 cursor-pointer group z-50 relative"
        >
          <img src="/favicon-32x32.png" alt="SCAI Logo" className="w-6 h-6" />
          <span className="text-foreground font-bold text-lg tracking-wide">scai</span>
        </div>

        {/* Desktop Nav - Only show when user is not signed in */}
        {!user && (
          <div className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium transition-colors duration-200 ${currentView === item.id
                    ? 'text-foreground'
                    : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 text-slate-500 hover:text-foreground text-sm font-medium px-2 py-1 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-medium text-sm">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-card border border-border py-1 z-50 overflow-hidden">
                  <button
                    onClick={() => {
                      onNavigate('dashboard');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-foreground flex items-center gap-2 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Dashboard
                  </button>
                  <div className="h-px bg-border my-1"></div>
                  <button
                    onClick={() => {
                      onSignOut();
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-foreground flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                  <div className="h-px bg-border my-1"></div>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onSignInClick}
              className="bg-black text-white hover:bg-gray-800 text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
            >
              Log in
            </button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-foreground z-50 relative p-2"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Mobile Menu Overlay */}
        {isMenuOpen && (
          <div className="fixed inset-0 bg-white z-40 flex flex-col pt-24 px-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-200 overflow-y-auto">
            <div className="flex flex-col gap-2 pb-10">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`text-left font-medium text-lg py-4 border-b border-border transition-colors ${currentView === item.id
                      ? 'text-foreground'
                      : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="pt-8 flex flex-col gap-4">
                {user ? (
                  <>
                    <div className="text-center text-slate-500 text-sm mb-2">
                      Signed in as <span className="font-medium text-foreground">{user.email}</span>
                    </div>
                    <button
                      onClick={() => { onSignOut(); setIsMenuOpen(false); }}
                      className="w-full py-3 text-slate-600 border border-border rounded-lg hover:bg-slate-50 font-medium flex items-center justify-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setShowDeleteModal(true);
                      }}
                      className="w-full py-3 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 font-medium flex items-center justify-center gap-2 mt-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { onSignInClick(); setIsMenuOpen(false); }}
                    className="w-full py-3 text-slate-600 border border-border rounded-lg hover:bg-slate-50 font-medium"
                  >
                    Log In
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Account Modal */}
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          title="Delete Account"
          message="This action cannot be undone. This will permanently delete your account and remove all your data including audits, projects, and settings."
          confirmText="Delete Account"
          onConfirm={async () => {
            try {
              await deleteService.deleteUserAccount();
              setShowDeleteModal(false);
              // After successful deletion, sign out and redirect
              onSignOut();
            } catch (error) {
              console.error('Failed to delete account:', error);
              // Error handling could be improved with toast notifications
            }
          }}
          onCancel={() => setShowDeleteModal(false)}
          requireTypedConfirmation={true}
        />

      </div>
    </nav>
  );
};

export default Navbar;