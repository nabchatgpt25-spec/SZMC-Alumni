import React from 'react';
import { Lock, ArrowLeft, ShieldCheck } from 'lucide-react';
import { AdminHubView } from './AdminHubView';
import { useAuth } from '../../context/AuthContext';

interface AdminPageProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onViewProfile }) => {
  const { currentUser, isLoggedIn, updateProfile } = useAuth();

  // Guard: Admins or moderators have full access
  const userRole = currentUser.role || 'member';
  const hasAccess = isLoggedIn && (userRole === 'admin' || userRole === 'moderator');

  if (!hasAccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            This area requires administrative privileges (Super Admin or Moderator role). Your current role is <strong className="uppercase text-slate-800 dark:text-slate-200">{userRole}</strong>.
          </p>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5">
            <button
              onClick={() => {
                updateProfile({ role: 'admin' });
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Elevate to Super Admin (Demo Mode)
            </button>

            {onNavigate && (
              <button
                onClick={() => onNavigate('dashboard')}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
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

  return (
    <AdminHubView
      currentUser={{
        id: currentUser.id,
        fullName: currentUser.fullName,
        role: (currentUser.role || 'admin') as any,
      }}
      onNavigate={onNavigate}
      onViewProfile={onViewProfile}
    />
  );
};

export default AdminPage;
