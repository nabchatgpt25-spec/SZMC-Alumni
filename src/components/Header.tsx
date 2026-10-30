import React, { useState, useRef, useEffect } from 'react';
import { Menu, Search, Mail, ChevronDown, User, LogOut, ShieldCheck, ShieldAlert, Clock, X, Settings, MessageCircle } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { NDCLogo } from './NDCLogo';
import { NotificationDropdown } from './NotificationDropdown';
import { useAuth } from '../context/AuthContext';
import { loadVouchRequests } from '../utils/verificationService';
import { isUserSuperAdmin, isUserGeneralAdmin, isUserSubAdmin } from '../types';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNavigate: (route: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenVerificationCenter?: (tab?: 'status' | 'vouch_classmates' | 'upload_id' | 'policy') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onNavigate,
  searchQuery,
  onSearchChange,
  onOpenVerificationCenter,
}) => {
  const { currentUser, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [pendingVouchRequestsCount, setPendingVouchRequestsCount] = useState<number>(() =>
    loadVouchRequests().filter((r) => r.status === 'pending').length
  );

  const isUserVerified = (currentUser.verificationStatus || 'verified') === 'verified';
  const userVouchesCount = currentUser.vouchesCount ?? (currentUser.verifiedBy?.length ?? (isUserVerified ? 2 : 0));
  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const isGeneralAdmin = isUserGeneralAdmin(currentUser);
  const isSubAdmin = isUserSubAdmin(currentUser);

  useEffect(() => {
    const syncVouches = () => {
      setPendingVouchRequestsCount(
        loadVouchRequests().filter((r) => r.status === 'pending').length
      );
    };
    window.addEventListener('ndc_vouch_requests_updated', syncVouches);
    return () => {
      window.removeEventListener('ndc_vouch_requests_updated', syncVouches);
    };
  }, []);

  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-18 bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl border-b border-slate-200/60 dark:border-white/10 shadow-xs transition-colors duration-200">
      <div className="h-full px-3 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-3 max-w-[1600px] mx-auto">
        {/* Left: Mobile Toggle, Mobile Brand & Search */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-2xl">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand logo display */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="shrink-0 flex items-center gap-2 cursor-pointer"
            title="SZMC Alumni Home"
          >
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center shadow-xs overflow-hidden">
              <NDCLogo className="w-full h-full" />
            </div>
            <span className="hidden xl:inline font-bold text-sm tracking-tight text-slate-900 dark:text-white">
              SZMC Alumni
            </span>
          </button>

          {/* Global Search Bar */}
          <div className="relative w-full min-w-0">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search alumni, batch..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 sm:pl-10 pr-2.5 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all truncate"
            />
          </div>
        </div>

        {/* Right Actions: Theme Toggle, Notifications, Messages, Profile */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Supabase Realtime Live Sync Badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold select-none cursor-default"
            title="Supabase WebSocket Realtime Synchronization Active"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="tracking-tight">Live Sync</span>
          </div>

          <div className="flex items-center">
            <ThemeToggle />
          </div>

          {/* Facebook-Style Notifications Bell & Dropdown */}
          <NotificationDropdown
            currentUserId={currentUser.id}
            onNavigate={onNavigate}
          />

          {/* Messages Button (Meta Messenger) */}
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            className="hidden sm:flex relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Messenger"
            aria-label="Messenger"
          >
            <MessageCircle className="w-5 h-5 text-[#0084FF]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0084FF] ring-2 ring-white dark:ring-slate-900" />
          </button>

          {/* User Profile Trigger & Dropdown */}
          <div className="relative pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
              }}
              className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <div className="relative">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20 dark:ring-blue-400/30"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 ring-2 ring-white dark:ring-slate-900 rounded-full" />
              </div>
              <div className="hidden md:block">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-1">
                  <span>{currentUser.fullName.split(' ')[0]} {currentUser.fullName.split(' ')[1] || ''}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 inline" />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Batch {currentUser.batchYear} · {currentUser.profession}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 hidden sm:block" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {currentUser.email || 'alumni@szmc.edu.bd'}
                  </div>
                </div>

                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('profile');
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    My Profile
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('settings');
                      setShowProfileMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    Settings
                  </button>

                  {onOpenVerificationCenter && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenVerificationCenter('status');
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span>Verification Center</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isUserVerified
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isUserVerified ? 'Verified' : `${userVouchesCount}/2`}
                      </span>
                    </button>
                  )}

                  {/* Admin Portal in profile dropdown - Strictly for role === 'admin' */}
                  {currentUser.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('admin');
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold">Admin Portal</span>
                      </span>
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                        ADMIN
                      </span>
                    </button>
                  )}

                  {/* Sub-Admin Portal in profile dropdown */}
                  {isSubAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('admin');
                        setShowProfileMenu(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span className="font-bold">Sub-Admin Portal</span>
                      </span>
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-400">
                        MODERATOR
                      </span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                      onNavigate('landing');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
