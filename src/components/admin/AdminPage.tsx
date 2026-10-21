import React, { useState } from 'react';
import { Lock, ArrowLeft, ShieldCheck, ShieldAlert, Sliders, Database } from 'lucide-react';
import { AdminHubView } from './AdminHubView';
import { AdminCommandCenterView } from './AdminCommandCenterView';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin, isUserGeneralAdmin, isUserSubAdmin } from '../../types';

interface AdminPageProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onViewProfile }) => {
  const { currentUser, isLoggedIn } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const isGeneralAdmin = isUserGeneralAdmin(currentUser);
  const isSubAdmin = isUserSubAdmin(currentUser);
  const hasAccess = isLoggedIn && (isSuperAdmin || isGeneralAdmin || isSubAdmin);

  const [adminMode, setAdminMode] = useState<'hub' | 'command_center'>(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('command-center') && isSuperAdmin) {
      return 'command_center';
    }
    return 'hub';
  });

  if (!hasAccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            This administrative area is restricted to authorized Super Administrators and appointed Admins. Your current membership account does not possess governance privileges.
          </p>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5">
            {onNavigate && (
              <button
                onClick={() => onNavigate('dashboard')}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // General Admin (e.g. firstaidnetworkbd@gmail.com): Admin Portal access
  if (isGeneralAdmin && !isSuperAdmin) {
    return (
      <div className="w-full space-y-4">
        {/* General Admin Header Bar */}
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-blue-200/60 dark:border-blue-900/40 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                  SZMC Admin Portal
                </h2>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                  ADMIN DESK
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Logged in as <strong className="text-slate-700 dark:text-slate-200">{currentUser.fullName}</strong> ({currentUser.email || 'firstaidnetworkbd@gmail.com'}) • Institutional administration and directory moderation
              </p>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            Administrator Privilege Active
          </span>
        </div>

        {/* Admin view: passes role 'admin' */}
        <AdminHubView
          currentUser={{
            id: currentUser.id,
            fullName: currentUser.fullName,
            role: 'admin',
            email: currentUser.email,
          }}
          onNavigate={onNavigate}
          onViewProfile={onViewProfile}
        />
      </div>
    );
  }

  // Sub-Admin (Moderator): Strictly confined to Sub-Admin Portal (AdminHubView with restricted moderation tabs)
  if (isSubAdmin && !isSuperAdmin) {
    return (
      <div className="w-full space-y-4">
        {/* Sub-Admin Header Bar */}
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-teal-200/60 dark:border-teal-900/40 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                  SZMC Sub-Admin Portal
                </h2>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                  SUB-ADMIN DESK
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Logged in as <strong className="text-slate-700 dark:text-slate-200">{currentUser.fullName}</strong> • Delegated ID reviews and feed moderation
              </p>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            Super admin controls &amp; system logs are isolated
          </span>
        </div>

        {/* Sub-admin view: passes role 'moderator' */}
        <AdminHubView
          currentUser={{
            id: currentUser.id,
            fullName: currentUser.fullName,
            role: 'moderator',
            email: currentUser.email,
          }}
          onNavigate={onNavigate}
          onViewProfile={onViewProfile}
        />
      </div>
    );
  }

  // Super Admin: Has full access to Admin Hub and Operations Command Center
  return (
    <div className="w-full space-y-4">
      {/* Top Admin Mode Switcher Bar */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-indigo-200/60 dark:border-indigo-900/40 rounded-2xl p-2.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                SZMC Super Admin Authority
              </h2>
              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                ROOT
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Authenticated as <span className="font-semibold text-indigo-600 dark:text-indigo-400">{currentUser.fullName}</span> ({currentUser.email || 'Super Admin'})
            </p>
          </div>
        </div>

        {/* Super Admin Console Segmented Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setAdminMode('hub')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adminMode === 'hub'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Admin Hub &amp; Moderation
          </button>

          <button
            type="button"
            onClick={() => setAdminMode('command_center')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              adminMode === 'command_center'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Operations Command Center
          </button>
        </div>
      </div>

      {/* Render selected console for Super Admin */}
      {adminMode === 'hub' ? (
        <AdminHubView
          currentUser={{
            id: currentUser.id,
            fullName: currentUser.fullName,
            role: 'admin',
            email: currentUser.email,
          }}
          onNavigate={onNavigate}
          onViewProfile={onViewProfile}
        />
      ) : (
        <AdminCommandCenterView onViewProfile={onViewProfile} />
      )}
    </div>
  );
};

export default AdminPage;
