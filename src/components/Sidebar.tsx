import React, { useState } from 'react';
import {
  Home,
  Users,
  Search,
  MapPin,
  BookOpen,
  Building2,
  GraduationCap,
  Newspaper,
  Calendar,
  Image,
  MessageCircle,
  Briefcase,
  HeartHandshake,
  Mail,
  User,
  X,
  BookmarkCheck,
  Sun,
  Moon,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Sparkles,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { NDCLogo } from './NDCLogo';
import { loadVouchRequests } from '../utils/verificationService';
import { isUserSuperAdmin, isUserGeneralAdmin, isUserSubAdmin } from '../types';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeType?: 'soon' | 'hot' | 'count';
}

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  customNavItems?: NavItemConfig[];
  onOpenVerificationCenter?: (tab?: 'status' | 'vouch_classmates' | 'upload_id' | 'policy') => void;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItemConfig[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onClose,
  customNavItems,
  onOpenVerificationCenter,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { currentUser } = useAuth();
  const isVerified = (currentUser.verificationStatus || 'verified') === 'verified';
  const pendingCount = loadVouchRequests().filter((r) => r.status === 'pending').length;
  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const isGeneralAdmin = isUserGeneralAdmin(currentUser);
  const isSubAdmin = isUserSubAdmin(currentUser);

  // Segment 1: MAIN Navigation
  const mainNavItems: NavItemConfig[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'alumni', label: 'Alumni Directory', icon: Users },
    { id: 'find', label: 'Find Alumni', icon: Search },
    { id: 'map', label: 'Alumni Map', icon: MapPin },
  ];

  // Segment 2: COMMUNITY Navigation
  const communityNavItems: NavItemConfig[] = [
    { id: 'batches', label: 'Batch Directory', icon: BookOpen },
    { id: 'news', label: 'News & Blog', icon: Newspaper, badge: 'SOON', badgeType: 'soon' },
    { id: 'events', label: 'Events (SZMC DAY)', icon: Calendar, badge: 'NOV 4-5', badgeType: 'hot' },
    { id: 'gallery', label: 'Gallery', icon: Image },
    { id: 'messages', label: 'Messages', icon: MessageCircle },
    { id: 'institutions', label: 'Institutions', icon: Building2, badge: 'SOON', badgeType: 'soon' },
  ];

  // Segment 3: SERVICES Navigation
  const servicesNavItems: NavItemConfig[] = [
    { id: 'emergency', label: 'Blood Network', icon: HeartHandshake, badge: 'LIVE', badgeType: 'hot' },
    { id: 'mentorship', label: 'Mentorship', icon: GraduationCap, badge: 'LIVE', badgeType: 'hot' },
    { id: 'careers', label: 'Career Portal', icon: Briefcase, badge: 'LIVE', badgeType: 'hot' },
    { id: 'contact', label: 'Contact Us', icon: Mail },
  ];

  const sections: NavSection[] = customNavItems
    ? [{ id: 'custom', title: 'MAIN', items: customNavItems }]
    : [
        { id: 'main', title: 'MAIN', items: mainNavItems },
        { id: 'community', title: 'COMMUNITY', items: communityNavItems },
        { id: 'services', title: 'SERVICES', items: servicesNavItems },
      ];

  const isItemActive = (id: string) => {
    if (activeTab === id) return true;
    if (id === 'dashboard' && activeTab === 'feed') return true;
    if (id === 'alumni' && activeTab === 'directory') return true;
    if (id === 'batches' && activeTab.startsWith('batch:')) return true;
    if (id === 'emergency' && (activeTab === 'blood' || activeTab === 'blood-network')) return true;
    if (id === 'admin' && (activeTab === 'admin' || activeTab === 'admin-center' || activeTab === 'admin-hub' || activeTab === 'admin-command-center')) return true;
    return false;
  };

  const renderNavButton = (item: NavItemConfig) => {
    const Icon = item.icon;
    const active = isItemActive(item.id);
    const isLive = item.badge === 'LIVE';

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectTab(item.id);
          onClose();
        }}
        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-[13px] font-medium transition-all text-left cursor-pointer group ${
          active
            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 transition-colors ${
              active
                ? 'text-white'
                : 'text-slate-400 dark:text-blue-300/60 group-hover:text-blue-600 dark:group-hover:text-blue-300'
            }`}
          />
          <span className="truncate">{item.label}</span>
        </div>

        {item.badge && (
          isLive ? (
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider transition-all animate-pulse ${
                active
                  ? 'bg-rose-500 text-white border-white/40'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 animate-ping shrink-0" />
              <span>LIVE</span>
            </span>
          ) : (
            <span
              className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border tracking-wider transition-colors ${
                active
                  ? 'bg-white/20 text-white border-white/30'
                  : 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300 border-blue-500/20'
              }`}
            >
              {item.badge}
            </span>
          )
        )}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Subtle Premium Bluish Liquid-Glass Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-72 max-w-[85vw] bg-gradient-to-b from-blue-50/90 via-slate-50/90 to-blue-50/85 dark:from-[#081226]/92 dark:via-[#0b172e]/90 dark:to-[#091428]/92 backdrop-blur-2xl border-r border-blue-200/60 dark:border-blue-500/20 shadow-xl shadow-blue-950/5 dark:shadow-2xl dark:shadow-black/60 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Brand Header */}
        <div className="h-18 px-5 flex items-center justify-between border-b border-blue-100/70 dark:border-blue-500/15 bg-white/40 dark:bg-blue-950/20 shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onClose();
            }}
            className="flex items-center gap-3 text-left cursor-pointer group min-w-0"
          >
            <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 p-1 border border-blue-200/70 dark:border-blue-500/25 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform overflow-hidden shrink-0">
              <NDCLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                SZMC Alumni
              </div>
              <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold tracking-wide truncate">
                Shaheed Ziaur Rahman Medical College
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 cursor-pointer transition-colors"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Content: 4 Clear Segments (MAIN, COMMUNITY, SERVICES, ACCOUNT) */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 space-y-4 scrollbar-thin">
          {sections.map((section) => (
            <div key={section.id} className="space-y-1">
              <div className="px-2.5 pt-1 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-900/65 dark:text-blue-300/70">
                  {section.title}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-blue-200/60 dark:from-blue-500/20 to-transparent ml-2.5" />
              </div>
              <div className="space-y-0.5">
                {section.items.map(renderNavButton)}
              </div>

              {/* Featured Event Card: SZMC DAY 2026 is on 4, 5th November */}
              {section.id === 'community' && (
                <div className="pt-2 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTab('events');
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-sky-800 text-white shadow-md shadow-blue-900/25 border border-blue-400/40 relative overflow-hidden group hover:scale-[1.02] transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider animate-pulse">
                        <Calendar className="w-2.5 h-2.5" />
                        4, 5th Nov 2026
                      </span>
                      <span className="text-[10px] font-bold text-amber-300">Open Now</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/20 shadow-xs bg-slate-900">
                        <img
                          src="/assets/aistudio/844630102_122141641941179457_1692878458464947990_n_99cb78bb.jpg"
                          alt="SZMC DAY 2026"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-xs text-white tracking-tight leading-tight truncate">
                          SZMC DAY 2026
                        </h4>
                        <p className="text-[10px] text-blue-200 mt-0.5 font-medium leading-tight">
                          is on 4, 5th November
                        </p>
                        <p className="text-[9px] text-amber-200/90 italic font-serif truncate mt-0.5">
                          &ldquo;এসো স্মৃতির প্রাঙ্গণে&rdquo;
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Segment 4: ACCOUNT */}
          <div className="space-y-1 pt-1">
            <div className="px-2.5 pt-1 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-900/65 dark:text-blue-300/70">
                ACCOUNT
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-blue-200/60 dark:from-blue-500/20 to-transparent ml-2.5" />
            </div>

            <div className="space-y-0.5">
              {/* My Profile */}
              <button
                type="button"
                onClick={() => {
                  onSelectTab('profile');
                  onClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] transition-all text-left cursor-pointer group ${
                  activeTab === 'profile'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
                }`}
              >
                <User
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    activeTab === 'profile'
                      ? 'text-white'
                      : 'text-slate-400 dark:text-blue-300/60 group-hover:text-blue-600 dark:group-hover:text-blue-300'
                  }`}
                />
                <span className="truncate">My Profile</span>
              </button>

              {/* Settings */}
              <button
                type="button"
                onClick={() => {
                  onSelectTab('settings');
                  onClose();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] transition-all text-left cursor-pointer group ${
                  activeTab === 'profile-settings' || activeTab === 'settings'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/25'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-blue-100/50 dark:hover:bg-blue-900/30'
                }`}
              >
                <Settings
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    activeTab === 'profile-settings' || activeTab === 'settings'
                      ? 'text-white'
                      : 'text-slate-400 dark:text-blue-300/60 group-hover:text-blue-600 dark:group-hover:text-blue-300'
                  }`}
                />
                <span className="truncate">Settings</span>
              </button>

              {/* Verification Center */}
              {onOpenVerificationCenter && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenVerificationCenter(isVerified ? 'vouch_classmates' : 'status');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="truncate">Verification Center</span>
                  </div>
                  <span
                    className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border tracking-wider ${
                      isVerified
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {isVerified ? (pendingCount > 0 ? `${pendingCount} Vouch` : 'Verified') : 'Pending'}
                  </span>
                </button>
              )}

              {/* Admin Command Hub - Strictly visible ONLY when logged in as role === 'admin' */}
              {currentUser.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('admin');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] transition-all text-left cursor-pointer group ${
                    isItemActive('admin')
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold shadow-md shadow-indigo-600/30'
                      : 'text-indigo-700 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-white hover:bg-indigo-100/70 dark:hover:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldAlert
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isItemActive('admin') ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    />
                    <span className="truncate font-black tracking-tight">Admin Portal</span>
                  </div>
                  <span className="shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 border-indigo-500/40 shadow-xs">
                    ADMIN
                  </span>
                </button>
              )}

              {/* Sub-Admin Portal - Strictly visible ONLY to appointed Sub-Admins / Moderators */}
              {isSubAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectTab('admin');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] transition-all text-left cursor-pointer group ${
                    isItemActive('admin')
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold shadow-md shadow-teal-600/30'
                      : 'text-teal-700 dark:text-teal-300 hover:text-teal-950 dark:hover:text-white hover:bg-teal-100/70 dark:hover:bg-teal-950/60 border border-teal-200/50 dark:border-teal-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isItemActive('admin') ? 'text-white' : 'text-teal-600 dark:text-teal-400'
                      }`}
                    />
                    <span className="truncate font-black tracking-tight">Sub-Admin Portal</span>
                  </div>
                  <span className="shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider bg-teal-500/20 text-teal-700 dark:text-teal-200 border-teal-500/40 shadow-xs">
                    SUB-ADMIN
                  </span>
                </button>
              )}

              {/* Quick Light / Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {isDark ? (
                    <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  )}
                  <span>{isDark ? 'Switch to Light' : 'Switch to Dark'}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/40">
                  {isDark ? 'Dark' : 'Light'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Eternal Brotherhood Heritage Seal */}
        <div className="px-3.5 pt-2 pb-1 shrink-0">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-blue-900/15 to-amber-500/5 dark:from-amber-400/10 dark:via-blue-950/40 dark:to-amber-400/5 border border-amber-300/40 dark:border-amber-400/25 shadow-xs backdrop-blur-sm relative overflow-hidden group transition-all hover:border-amber-400/60 dark:hover:border-amber-400/40">
            {/* Subtle warm ambient highlight */}
            <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-amber-400/20 dark:bg-amber-300/15 blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />

            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded-md bg-amber-500/20 dark:bg-amber-400/20 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
                <Sparkles className="w-3 h-3" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300 font-mono">
                Eternal Motto
              </span>
            </div>

            <p className="font-serif italic text-xs font-semibold leading-relaxed text-slate-800 dark:text-amber-100 tracking-wide">
              &ldquo;Once a SZMCian, Always a SZMCian.&rdquo;
            </p>

            <div className="mt-2 pt-1.5 border-t border-amber-300/30 dark:border-amber-400/15 flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="italic">Service to Humanity • Silimpur</span>
              <span className="text-amber-700 dark:text-amber-300 font-bold">Est. 1992</span>
            </div>
          </div>
        </div>

        {/* Bottom Card */}
        <div className="p-3.5 border-t border-blue-100/70 dark:border-blue-500/15 bg-white/30 dark:bg-blue-950/20 shrink-0 space-y-2.5">
          <PWAInstallButton variant="sidebar" className="w-full justify-center" />
          <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            <a
              href="http://nurulanambashir.gt.tc/?i=1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Design and Developed by Bashir-34
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
