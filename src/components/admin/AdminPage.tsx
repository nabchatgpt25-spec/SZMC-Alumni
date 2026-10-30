import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Database,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { AdminHubView } from './AdminHubView';
import { AdminCommandCenterView } from './AdminCommandCenterView';
import { useAuth } from '../../context/AuthContext';

interface AdminPageProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

interface ServerVerificationResult {
  authorized: boolean;
  role: string;
  userId?: number;
  userUid?: string;
  email?: string;
  fullName?: string;
  verifiedViaMetadata?: boolean;
  timestamp?: string;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onViewProfile }) => {
  const { currentUser, isLoggedIn, getAuthHeaders } = useAuth();

  const [verificationStatus, setVerificationStatus] = useState<
    'verifying' | 'authorized' | 'denied'
  >('verifying');
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const [verifiedDetails, setVerifiedDetails] = useState<ServerVerificationResult | null>(null);

  const [adminMode, setAdminMode] = useState<'hub' | 'command_center'>('hub');

  // Strict Server-Side Authentication Verification
  const verifyServerAdminAccess = useCallback(async () => {
    if (!isLoggedIn) {
      setVerificationStatus('denied');
      setDenialReason('Authentication required. Please log in with an administrator account.');
      return;
    }

    setVerificationStatus('verifying');
    setDenialReason(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/verify-access', {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        let errMessage = 'Forbidden: Admin access restricted to verified administrators.';
        try {
          const errData = await res.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          // ignore parsing error
        }

        setVerificationStatus('denied');
        setDenialReason(errMessage);
        setVerifiedDetails(null);
        return;
      }

      const data: ServerVerificationResult = await res.json();

      // Ensure that only users with an 'admin' role can access the admin dashboard
      if (data?.authorized === true && data?.role === 'admin') {
        setVerificationStatus('authorized');
        setVerifiedDetails(data);
        setDenialReason(null);
      } else {
        setVerificationStatus('denied');
        setDenialReason(
          'Your account role is not recognized as an administrator in Supabase Auth metadata or verified governance records.'
        );
        setVerifiedDetails(null);
      }
    } catch (err: any) {
      console.error('Server-side admin verification failed:', err);
      setVerificationStatus('denied');
      setDenialReason(
        err.message ||
          'Unable to verify administrative authorization with backend server. Check your network connection.'
      );
      setVerifiedDetails(null);
    }
  }, [isLoggedIn, getAuthHeaders]);

  useEffect(() => {
    void verifyServerAdminAccess();
  }, [verifyServerAdminAccess]);

  // 1. Verifying state: Server-side cryptographic check in progress
  if (verificationStatus === 'verifying') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 animate-ping opacity-40" />
            <div className="relative w-14 h-14 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-200 dark:border-indigo-800 shadow-sm">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Verifying Admin Authority
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Conducting strict server-side validation of your Supabase Auth session token and admin role metadata...
          </p>
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>Zero-Trust Server Policy Enforced</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Access Denied state: Failed server-side authentication
  if (verificationStatus === 'denied') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200/60 dark:border-rose-900/40 rounded-2xl p-8 shadow-xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20 shadow-xs">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Access Restricted
          </h2>
          <div className="my-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-800/40 text-left">
            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
              {denialReason ||
                'This administrative area is restricted to users with a verified "admin" role in Supabase Auth metadata.'}
            </p>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            All hardcoded email bypasses have been eradicated. Your account (
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {currentUser.email || currentUser.fullName || 'Guest'}
            </span>
            ) does not hold verified administrator authority on the server.
          </p>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void verifyServerAdminAccess()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-verify Credentials
            </button>
            {onNavigate && (
              <button
                type="button"
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

  // 3. Authorized State: Server-side check confirmed user has 'admin' role
  return (
    <div className="w-full space-y-4">
      {/* Top Admin Header Bar with Server-Verified Badge */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-indigo-200/60 dark:border-indigo-900/40 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                SZMC Institutional Governance Portal
              </h2>
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-2.5 h-2.5" />
                SERVER VERIFIED ADMIN
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Authenticated Administrator:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {verifiedDetails?.fullName || currentUser.fullName}
              </strong>{' '}
              ({verifiedDetails?.email || currentUser.email || 'Admin'}) • Role:{' '}
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold uppercase">
                {verifiedDetails?.role || 'admin'}
              </span>
            </p>
          </div>
        </div>

        {/* Admin Mode Switcher: Hub vs Command Center */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setAdminMode('hub')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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

      {/* Render Selected View */}
      {adminMode === 'hub' ? (
        <AdminHubView
          currentUser={{
            id: verifiedDetails?.userId || currentUser.id,
            fullName: verifiedDetails?.fullName || currentUser.fullName,
            role: 'admin',
            email: verifiedDetails?.email || currentUser.email,
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
