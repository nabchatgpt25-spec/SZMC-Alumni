import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  type Variants,
} from 'motion/react';
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
  Radio,
  Sparkles,
  Palette,
  Search,
  Settings,
  Type,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Menu,
  X,
  Bell,
  Activity,
  Layers,
} from 'lucide-react';
import type { AdminControlPanelSection } from './AdminControlPanel';
import { AdminRealtimeProvider } from './AdminRealtimeContext';
import { useAdminVisualMode } from './adminVisualModes';
import { useAuth } from '../../context/AuthContext';
import { SZMCLogo } from '../SZMCLogo';

const AdminHubView = lazy(() => import('./AdminHubView').then((m) => ({ default: m.AdminHubView })));
const AdminCommandCenterView = lazy(() =>
  import('./AdminCommandCenterView').then((m) => ({ default: m.AdminCommandCenterView }))
);
const AdminDashboard = lazy(() =>
  import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const AdminControlPanel = lazy(() =>
  import('./AdminControlPanel').then((m) => ({ default: m.AdminControlPanel }))
);
const AdminDashboardStats = lazy(() =>
  import('./AdminDashboardStats').then((m) => ({ default: m.AdminDashboardStats }))
);
const AdminUserTelemetryView = lazy(() =>
  import('./AdminUserTelemetryView').then((m) => ({ default: m.AdminUserTelemetryView }))
);
const AdminCommunityManagementView = lazy(() =>
  import('./AdminCommunityManagementView').then((m) => ({
    default: m.AdminCommunityManagementView,
  }))
);

const FLUID_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const adminShellVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: FLUID_EASE,
      when: 'beforeChildren',
      staggerChildren: 0.08,
    },
  },
};

const adminStaggerSectionVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.992 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.38,
      ease: FLUID_EASE,
      staggerChildren: 0.06,
    },
  },
};

const adminHeaderItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: FLUID_EASE },
  },
};

const adminModuleSwapVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.992 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.34,
      ease: FLUID_EASE,
      staggerChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.995,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

interface AdminPageProps {
  onNavigate?: (route: string) => void;
  onViewProfile?: (userId: number) => void;
}

interface ServerRolePermissions {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  canAccessAdminPortal: boolean;
  canModerateContent: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canAssignAdminRoles: boolean;
  canAccessTelemetry: boolean;
  canExportBackups: boolean;
}

interface ServerVerificationResult {
  authorized: boolean;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions?: ServerRolePermissions;
  userId?: number;
  userUid?: string;
  email?: string;
  fullName?: string;
  verifiedViaMetadata?: boolean;
  timestamp?: string;
}

type AdminWorkspaceMode =
  | 'control_panel'
  | 'community'
  | 'activity_center'
  | 'dashboard'
  | 'hub'
  | 'command_center';

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onViewProfile }) => {
  const { currentUser, isLoggedIn, getAuthHeaders } = useAuth();

  const [verificationStatus, setVerificationStatus] = useState<
    'verifying' | 'authorized' | 'denied'
  >('verifying');
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const [verifiedDetails, setVerifiedDetails] = useState<ServerVerificationResult | null>(null);

  const [adminMode, setAdminMode] = useState<AdminWorkspaceMode>('control_panel');
  const [controlSection, setControlSection] = useState<AdminControlPanelSection>('settings');
  const [classicSearch, setClassicSearch] = useState('');
  const [mobileClassicSidebarOpen, setMobileClassicSidebarOpen] = useState(false);

  const [visualMode, setVisualMode] = useAdminVisualMode();
  const isNeonMode = visualMode === 'neon_aura';

  // Strict Zero-Trust Server-Side Authorization Verification (zero client-side fallbacks)
  const verifyServerAdminAccess = useCallback(async () => {
    if (!isLoggedIn) {
      setVerificationStatus('denied');
      setDenialReason('Authentication required. Please log in with an authorized governance account.');
      setVerifiedDetails(null);
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
        let errMessage = 'Forbidden: Access restricted to verified moderators and administrators.';
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
      const allowedRoles = new Set(['super_admin', 'admin', 'moderator']);

      if (data?.authorized === true && allowedRoles.has(data.role)) {
        setVerificationStatus('authorized');
        setVerifiedDetails(data);
        setDenialReason(null);

        // Ensure moderators land on a permitted moderation section immediately
        if (data.role === 'moderator') {
          setAdminMode('control_panel');
          setControlSection('posts');
        }
      } else {
        setVerificationStatus('denied');
        setDenialReason(
          'Your account role is not verified for administrative or moderation access on the server.'
        );
        setVerifiedDetails(null);
      }
    } catch (err: any) {
      console.error('Server-side admin verification failed:', err);
      setVerificationStatus('denied');
      setDenialReason(
        err?.message ||
          'Unable to verify administrative authorization with the backend server. Access is denied until verified.'
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
      <MotionConfig reducedMotion="user">
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.36, ease: FLUID_EASE }}
            className="text-center max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl"
          >
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
          </motion.div>
        </div>
      </MotionConfig>
    );
  }

  // 2. Access Denied state: Failed server-side authentication
  if (verificationStatus === 'denied') {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.36, ease: FLUID_EASE }}
            className="text-center max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200/60 dark:border-rose-900/40 rounded-2xl p-8 shadow-xl"
          >
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
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => void verifyServerAdminAccess()}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-verify Credentials
              </motion.button>
              {onNavigate && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => onNavigate('dashboard')}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to Dashboard
                </motion.button>
              )}
            </div>
          </motion.div>
        </div>
      </MotionConfig>
    );
  }

  const adminDisplayName = verifiedDetails?.fullName || currentUser.fullName || 'Administrator';
  const verifiedRole: 'super_admin' | 'admin' | 'moderator' =
    verifiedDetails?.role === 'super_admin'
      ? 'super_admin'
      : verifiedDetails?.role === 'admin'
      ? 'admin'
      : 'moderator';
  const serverPerms = verifiedDetails?.permissions;
  const isVerifiedSuperAdmin =
    verifiedRole === 'super_admin' || Boolean(serverPerms?.isSuperAdmin);
  const isVerifiedAdmin =
    isVerifiedSuperAdmin || verifiedRole === 'admin' || Boolean(serverPerms?.isAdmin);
  const adminRoleLabel =
    verifiedRole === 'super_admin'
      ? 'Super Admin'
      : verifiedRole === 'admin'
      ? 'Admin'
      : 'Moderator';

  const allMainNavItems: Array<{
    id: AdminWorkspaceMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    minTier: 'moderator' | 'admin' | 'super_admin';
  }> = [
    { id: 'control_panel', label: 'Control Panel', icon: Radio, minTier: 'moderator' },
    { id: 'community', label: 'The Quad', icon: Layers, minTier: 'moderator' },
    { id: 'activity_center', label: 'User Activity & Ads', icon: Activity, minTier: 'super_admin' },
    { id: 'dashboard', label: 'Dashboard', icon: ShieldCheck, minTier: 'moderator' },
    { id: 'hub', label: 'Admin Hub', icon: Sliders, minTier: 'admin' },
    { id: 'command_center', label: 'Command Center', icon: Database, minTier: 'super_admin' },
  ];

  const classicMainNavItems = allMainNavItems.filter((item) => {
    if (item.minTier === 'super_admin') return isVerifiedSuperAdmin;
    if (item.minTier === 'admin') return isVerifiedAdmin;
    return true;
  });

  const allControlSections: Array<{
    id: AdminControlPanelSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    minTier: 'moderator' | 'admin';
  }> = [
    { id: 'settings', label: 'Landing & Settings', icon: Settings, minTier: 'admin' },
    { id: 'theme', label: 'Global Theme', icon: Palette, minTier: 'admin' },
    { id: 'typography', label: 'Typography & Styles', icon: Type, minTier: 'admin' },
    { id: 'posts', label: 'Posts & Feed', icon: FileText, minTier: 'moderator' },
    { id: 'gallery', label: 'Gallery Media', icon: ImageIcon, minTier: 'moderator' },
    { id: 'notices', label: 'Official Notices', icon: Bell, minTier: 'moderator' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, minTier: 'admin' },
  ];

  const classicControlSections = allControlSections.filter((sec) => {
    if (sec.minTier === 'admin') return isVerifiedAdmin;
    return true;
  });

  const effectiveAdminMode: AdminWorkspaceMode = classicMainNavItems.some((m) => m.id === adminMode)
    ? adminMode
    : classicMainNavItems[0]?.id || 'dashboard';

  const effectiveControlSection: AdminControlPanelSection = classicControlSections.some(
    (s) => s.id === controlSection
  )
    ? controlSection
    : classicControlSections[0]?.id || 'posts';

  const moduleLoadingFallback = (
    <div
      className={`min-h-[260px] rounded-2xl border flex items-center justify-center p-8 ${
        isNeonMode
          ? 'bg-[#081229]/70 border-cyan-400/20 text-cyan-200'
          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400'
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs font-semibold">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading workspace module...</span>
      </div>
    </div>
  );

  const renderActiveModule = () => (
    <Suspense fallback={moduleLoadingFallback}>
      <AnimatePresence mode="wait">
      {effectiveAdminMode === 'control_panel' ? (
        <motion.div
          key="module-control-panel"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminControlPanel
            activeSection={effectiveControlSection}
            onSectionChange={(nextSec) => {
              if (classicControlSections.some((s) => s.id === nextSec)) {
                setControlSection(nextSec);
              }
            }}
            externalSearch={!isNeonMode ? classicSearch : undefined}
          />
        </motion.div>
      ) : effectiveAdminMode === 'community' ? (
        <motion.div
          key="module-community"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminCommunityManagementView
            verifiedRole={verifiedRole}
            visualMode={visualMode}
            externalSearch={!isNeonMode ? classicSearch : undefined}
            onViewProfile={onViewProfile}
          />
        </motion.div>
      ) : effectiveAdminMode === 'activity_center' && isVerifiedSuperAdmin ? (
        <motion.div
          key="module-activity-center"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminUserTelemetryView
            onViewProfile={onViewProfile}
            externalSearch={!isNeonMode ? classicSearch : undefined}
          />
        </motion.div>
      ) : effectiveAdminMode === 'dashboard' ? (
        <motion.div
          key="module-dashboard"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminDashboard onNavigate={onNavigate} onViewProfile={onViewProfile} />
        </motion.div>
      ) : effectiveAdminMode === 'hub' && isVerifiedAdmin ? (
        <motion.div
          key="module-hub"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminHubView
            currentUser={{
              id: verifiedDetails?.userId || currentUser.id,
              fullName: adminDisplayName,
              role: verifiedRole,
              email: verifiedDetails?.email || currentUser.email,
            }}
            onNavigate={onNavigate}
            onViewProfile={onViewProfile}
          />
        </motion.div>
      ) : isVerifiedSuperAdmin ? (
        <motion.div
          key="module-command-center"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminCommandCenterView onViewProfile={onViewProfile} />
        </motion.div>
      ) : (
        <motion.div
          key="module-fallback-dashboard"
          layout
          variants={adminModuleSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ layout: { duration: 0.32, ease: FLUID_EASE } }}
        >
          <AdminDashboard onNavigate={onNavigate} onViewProfile={onViewProfile} />
        </motion.div>
      )}
      </AnimatePresence>
    </Suspense>
  );

  const renderClassicSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 bg-[#002247] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/10 p-1 border border-white/15 shrink-0 flex items-center justify-center">
            <SZMCLogo className="w-full h-full" />
          </div>
          <span
            data-preserve-text-color="true"
            className="text-sm font-extrabold tracking-tight text-white truncate"
          >
            SZMC Admin
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileClassicSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Admin Profile Row */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={adminDisplayName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border-2 border-white/25 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-sky-500/25 border border-sky-300/40 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {adminDisplayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div
              data-preserve-text-color="true"
              className="text-xs font-semibold text-white truncate"
            >
              {adminDisplayName}
            </div>
            <div className="text-[11px] text-sky-200/75 capitalize truncate">
              Verified {adminRoleLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* Main Workspaces */}
        <div>
          <div className="px-2.5 mb-2 text-[11px] font-semibold text-sky-200/55">
            Main
          </div>
          <nav className="space-y-0.5">
            {classicMainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = effectiveAdminMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setAdminMode(item.id);
                    setMobileClassicSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white/12 text-[#faad14] font-semibold'
                      : 'text-slate-200/85 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#faad14]' : 'text-sky-200/75'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Settings & Content Shortcuts */}
        <div>
          <div className="px-2.5 mb-2 text-[11px] font-semibold text-sky-200/55">
            Settings &amp; Content
          </div>
          <nav className="space-y-0.5">
            {classicControlSections.map((sec) => {
              const Icon = sec.icon;
              const isActive =
                effectiveAdminMode === 'control_panel' && effectiveControlSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setAdminMode('control_panel');
                    setControlSection(sec.id);
                    setMobileClassicSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white/10 text-[#faad14] font-semibold'
                      : 'text-slate-200/80 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#faad14]' : 'text-sky-200/70'}`} />
                  <span className="truncate">{sec.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Mode Switch Footer */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => {
            setVisualMode('neon_aura');
            setMobileClassicSidebarOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          <span>Switch to Neon Mode 1</span>
        </button>
      </div>
    </div>
  );

  // 3. Authorized State: Classic Wieldy-Inspired Layout vs Neon Mode 1
  return (
    <MotionConfig reducedMotion="user">
      <AdminRealtimeProvider>
        <LayoutGroup id="szmc-admin-workspace">
          {!isNeonMode ? (
            /* CLASSIC MODE: Crisp Deep Navy Left Sidebar + Pure White Topbar + Light Canvas */
            <motion.div
              layout
              variants={adminShellVariants}
              initial="hidden"
              animate="visible"
              transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
              className="admin-classic-shell w-full rounded-2xl overflow-hidden flex min-h-[78vh] relative"
            >
              {/* Desktop Persistent Deep Navy Sidebar */}
              <aside className="admin-classic-sidebar hidden lg:flex lg:flex-col w-[236px] shrink-0">
                {renderClassicSidebarContent()}
              </aside>

              {/* Mobile Slide-Over Navy Sidebar Drawer */}
              <AnimatePresence>
                {mobileClassicSidebarOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setMobileClassicSidebarOpen(false)}
                      className="fixed inset-0 bg-slate-950/50 z-40 lg:hidden"
                    />
                    <motion.aside
                      initial={{ x: -260 }}
                      animate={{ x: 0 }}
                      exit={{ x: -260 }}
                      transition={{ duration: 0.24, ease: FLUID_EASE }}
                      className="admin-classic-sidebar fixed inset-y-0 left-0 w-[248px] z-50 lg:hidden shadow-2xl"
                    >
                      {renderClassicSidebarContent()}
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>

              {/* Right Main Classic Workspace */}
              <div className="admin-classic-main flex-1 min-w-0 flex flex-col">
                {/* Crisp White Top Utility Bar */}
                <header className="h-14 px-4 sm:px-6 bg-white border-b border-slate-200/80 flex items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3 flex-1 min-w-0 max-w-md">
                    <button
                      type="button"
                      onClick={() => setMobileClassicSidebarOpen(true)}
                      className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
                      aria-label="Open admin menu"
                    >
                      <Menu className="w-4 h-4" />
                    </button>

                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={classicSearch}
                        onChange={(e) => setClassicSearch(e.target.value)}
                        placeholder="Search in admin..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#038fde]"
                      />
                    </div>
                  </div>

                  {/* Right Side: Appearance Switcher & Verified Label */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/80 shrink-0">
                      <button
                        type="button"
                        onClick={() => setVisualMode('neon_aura')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Neon Mode 1</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualMode('classic')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-[#003366] shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Palette className="w-3 h-3" />
                        <span>Classic</span>
                      </button>
                    </div>

                    <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-medium text-slate-800">{adminDisplayName}</span>
                    </div>
                  </div>
                </header>

                {/* Scrollable Workspace Content */}
                <div className="p-4 sm:p-6 space-y-5 flex-1">
                  {/* Active Management Module (Wave KPIs, Balance Overview, Activity Area + All Existing CRUD Features) */}
                  <motion.div
                    layout
                    variants={adminStaggerSectionVariants}
                    transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
                    className="w-full"
                  >
                    {renderActiveModule()}
                  </motion.div>

                  {/* Real-Time Recharts Analytics Overview (User Growth Bar Chart & Batch Distribution Donut) */}
                  <motion.div
                    layout
                    variants={adminStaggerSectionVariants}
                    transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
                    className="w-full"
                  >
                    <Suspense fallback={moduleLoadingFallback}>
                      <AdminDashboardStats />
                    </Suspense>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* NEON MODE 1: Signature Cosmic Glass Layout (Preserved Intact) */
            <motion.div
              layout
              variants={adminShellVariants}
              initial="hidden"
              animate="visible"
              transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
              className="w-full space-y-5 transition-colors duration-300 admin-neon-shell rounded-3xl p-3.5 sm:p-5 lg:p-6"
            >
              {/* Top Admin Header Bar with Staggered Entry & Layout Choreography */}
              <motion.div
                layout
                variants={adminStaggerSectionVariants}
                transition={{ layout: { duration: 0.3, ease: FLUID_EASE } }}
                className="backdrop-blur-xl rounded-2xl p-3 sm:p-3.5 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 transition-colors bg-[#081229]/85 border border-cyan-400/25 shadow-[0_0_30px_-10px_rgba(34,211,238,0.28)]"
              >
                <motion.div variants={adminHeaderItemVariants} className="flex items-center gap-3 min-w-0">
                  <motion.div
                    whileHover={{ scale: 1.06, rotate: -3 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 bg-gradient-to-br from-cyan-500/25 to-violet-500/25 text-cyan-300 border border-cyan-400/35 shadow-[0_0_16px_rgba(34,211,238,0.3)]"
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </motion.div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        data-preserve-text-color="true"
                        className="text-sm font-black leading-tight text-white"
                      >
                        SZMC Institutional Governance Portal
                      </h2>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Verified {adminRoleLabel}
                      </span>
                    </div>
                    <p className="text-[11px] truncate text-slate-300">
                      Administrator:{' '}
                      <strong className="text-cyan-200">{adminDisplayName}</strong>{' '}
                      ·{' '}
                      <span className="font-mono font-bold uppercase text-cyan-300">
                        {adminRoleLabel}
                      </span>
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  variants={adminHeaderItemVariants}
                  className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-between xl:justify-end"
                >
                  {/* Appearance Mode Switcher (Mode 1: Neon Aura vs Classic Clean) */}
                  <div
                    className="inline-flex items-center gap-1 p-1 rounded-xl shrink-0 bg-slate-950/80 border border-cyan-400/25"
                    title="Switch Admin Dashboard Appearance Mode"
                  >
                    <button
                      type="button"
                      onClick={() => setVisualMode('neon_aura')}
                      className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 text-white"
                    >
                      <motion.span
                        layoutId="adminVisualModeIndicator"
                        className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 shadow-[0_0_14px_rgba(34,211,238,0.55)]"
                        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                      />
                      <Sparkles className="w-3 h-3 relative z-10" />
                      <span className="relative z-10">Neon Mode 1</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVisualMode('classic')}
                      className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 text-slate-400 hover:text-slate-100"
                    >
                      <Palette className="w-3 h-3 relative z-10" />
                      <span className="relative z-10">Classic</span>
                    </button>
                  </div>

                  {/* Admin Workspace View Switcher: Control Panel vs Hub vs Dashboard vs Command Center */}
                  <div className="flex items-center p-1 rounded-xl w-full sm:w-auto shrink-0 gap-1 overflow-x-auto bg-slate-950/80 border border-white/10">
                    {classicMainNavItems.map((tab) => {
                      const Icon = tab.icon;
                      const active = effectiveAdminMode === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAdminMode(tab.id)}
                          className={`relative flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            active ? 'text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="adminPageModeTab"
                              className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/30 via-blue-500/35 to-violet-500/35 border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.35)]"
                              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            />
                          )}
                          <Icon className="w-3.5 h-3.5 relative z-10" />
                          <span className="relative z-10">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>

              {/* Real-Time Recharts Analytics Overview */}
              <motion.div
                layout
                variants={adminStaggerSectionVariants}
                transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
                className="w-full"
              >
                <Suspense fallback={moduleLoadingFallback}>
                  <AdminDashboardStats />
                </Suspense>
              </motion.div>

              {/* Staggered Management Module Stage with Fluid Layout Transitions */}
              <motion.div
                layout
                variants={adminStaggerSectionVariants}
                transition={{ layout: { duration: 0.34, ease: FLUID_EASE } }}
                className="w-full"
              >
                {renderActiveModule()}
              </motion.div>
            </motion.div>
          )}
        </LayoutGroup>
      </AdminRealtimeProvider>
    </MotionConfig>
  );
};

export default AdminPage;

