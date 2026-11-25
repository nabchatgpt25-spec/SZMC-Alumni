import React, { useState, useEffect } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Bell,
  Heart,
  Moon,
  Sun,
  Globe,
  Download,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  AlertCircle,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  Volume2,
  VolumeX,
  MessageSquare,
  Type,
  BadgeCheck,
  Sparkles,
  Droplets,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SZMCLogo } from './SZMCLogo';
import { getDonorProfileByUserId } from '../utils/bloodDonationService';
import { VerifiedAvatar } from './verification/VerifiedAvatar';
import { MessageSettingsModal } from './messenger/MessageSettingsModal';
import {
  PROFILE_DISPLAY_MODES,
  getProfileDisplayModePreference,
  saveProfileDisplayModePreference,
  type ProfileDisplayModeId,
  type ProfileDisplayModePreference,
  type ProfileDisplayModeScope,
} from '../data/profileDisplayModes';
import { renderFrostedProfileCardImage } from '../utils/profileCardCanvas';
import { triggerBlobDownload } from '../utils/imageDownload';
import { fetchSocialGraphSnapshot } from '../services/socialGraphService';
import { supabase, isSupabaseConfigured, getClientAuthHeaders } from '../lib/supabase';

interface SettingsViewProps {
  onNavigate: (route: string) => void;
  onOpenVerificationCenter?: (tab?: 'status' | 'vouch_classmates' | 'upload_id' | 'policy') => void;
  onBack?: () => void;
}

type SimpleCategoryId = 'profile' | 'display' | 'privacy' | 'account';

interface CategoryItem {
  id: SimpleCategoryId;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBgClass: string;
}

const SIMPLE_CATEGORIES: CategoryItem[] = [
  {
    id: 'profile',
    title: 'My Info & ID Card',
    subtitle: 'Edit your name, hospital, phone & download your Alumni Card',
    icon: User,
    iconBgClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
  },
  {
    id: 'display',
    title: 'Screen & Language',
    subtitle: 'Classic or Liquid Glass mode, light/dark screen, text size & ভাষা',
    icon: Sun,
    iconBgClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  },
  {
    id: 'privacy',
    title: 'Privacy & Alerts',
    subtitle: 'Who can see your phone, blood donor switch & message alerts',
    icon: ShieldCheck,
    iconBgClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  },
  {
    id: 'account',
    title: 'Password & Sign Out',
    subtitle: 'Change your password, sign out safely, or manage account',
    icon: Lock,
    iconBgClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
];

interface SimpleSwitchRowProps {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  accentColor?: 'blue' | 'rose' | 'emerald';
}

const SimpleSwitchRow: React.FC<SimpleSwitchRowProps> = ({
  title,
  description,
  checked,
  onToggle,
  accentColor = 'blue',
}) => {
  const activeTrackClass =
    accentColor === 'rose'
      ? 'bg-rose-600'
      : accentColor === 'emerald'
      ? 'bg-emerald-600'
      : 'bg-blue-600';

  const activeTextClass =
    accentColor === 'rose'
      ? 'text-rose-600 dark:text-rose-400'
      : accentColor === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-blue-600 dark:text-blue-400';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="w-full py-4 flex items-center justify-between gap-4 text-left cursor-pointer group active:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="text-base font-semibold text-slate-900 dark:text-white leading-snug">
          {title}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
          {description}
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <span
          className={`text-xs font-bold tracking-wide w-7 text-right ${
            checked ? activeTextClass : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
        <span
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-150 ${
            checked ? activeTrackClass : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              checked ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </span>
      </div>
    </button>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  onNavigate,
  onOpenVerificationCenter,
  onBack,
}) => {
  const { currentUser, updateProfile, deleteAccount, logout } = useAuth();
  const { setTheme, isDark, visualMode, isGlassMode, isClearGlassMode, setVisualMode, toggleGlassMode } = useTheme();

  // Desktop always shows activeCategory in the right pane; mobile starts on Home ('home')
  // and opens the chosen category cleanly with a big Back button so there's zero confusion.
  const [activeCategory, setActiveCategory] = useState<SimpleCategoryId>('profile');
  const [mobileView, setMobileView] = useState<'home' | SimpleCategoryId>('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Easy-to-read Text Size toggle (Normal vs Large)
  const [isLargeText, setIsLargeText] = useState<boolean>(() => {
    try {
      return localStorage.getItem('szmc_text_size') === 'large';
    } catch {
      return false;
    }
  });

  // Inline Edit & Modal States
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showAdvancedAccount, setShowAdvancedAccount] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deletePasswordConfirm, setDeletePasswordConfirm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Personal Edit Form State
  const [editFullName, setEditFullName] = useState(currentUser.fullName);
  const [editProfession, setEditProfession] = useState(currentUser.profession || '');
  const [editPosition, setEditPosition] = useState(currentUser.position || '');
  const [editInstitution, setEditInstitution] = useState(currentUser.institution || '');
  const [editCity, setEditCity] = useState(currentUser.city || '');
  const [editCountry, setEditCountry] = useState(currentUser.country || 'Bangladesh');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '');
  const [editWhatsapp, setEditWhatsapp] = useState(currentUser.whatsapp || '');
  const [editBio, setEditBio] = useState(currentUser.bio || '');

  useEffect(() => {
    if (isEditingPersonal) return;
    setEditFullName(currentUser.fullName || '');
    setEditProfession(currentUser.profession || '');
    setEditPosition(currentUser.position || '');
    setEditInstitution(currentUser.institution || '');
    setEditCity(currentUser.city || '');
    setEditCountry(currentUser.country || 'Bangladesh');
    setEditPhone(currentUser.phone || '');
    setEditWhatsapp(currentUser.whatsapp || '');
    setEditBio(currentUser.bio || '');
  }, [currentUser, isEditingPersonal]);

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Privacy & Preferences State (synced to localStorage)
  const [contactAudience, setContactAudience] = useState<'verified' | 'batch_only' | 'everyone' | 'private'>(() => {
    try {
      return (localStorage.getItem('szmc_settings_contact_audience') as any) || 'verified';
    } catch {
      return 'verified';
    }
  });

  const [institutionVisibility, setInstitutionVisibility] = useState<'public' | 'verified_only'>(() => {
    try {
      return (localStorage.getItem('szmc_settings_inst_visibility') as any) || 'public';
    } catch {
      return 'public';
    }
  });

  const [notificationPreferences, setNotificationPreferences] = useState(() => {
    try {
      const raw = localStorage.getItem('szmc_settings_notifications');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      batchAnnouncements: true,
      bloodEmergencyCalls: true,
      peerVouches: true,
      mentorshipRequests: true,
      postComments: true,
      soundEnabled: true,
      emailDigest: false,
    };
  });

  const [bloodDonorPreferences, setBloodDonorPreferences] = useState(() => {
    try {
      const raw = localStorage.getItem('szmc_settings_blood_donor');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      isAvailable: true,
      corridors: ['Bogura City & SZMCH', 'Rajshahi Division'],
      plateletsWilling: true,
      plasmaWilling: true,
      allowDirectPhoneCalls: true,
    };
  });

  const [languagePreference, setLanguagePreference] = useState<'en' | 'bn'>(() => {
    try {
      return (localStorage.getItem('szmc_settings_lang') as 'en' | 'bn') || 'en';
    } catch {
      return 'en';
    }
  });

  const [profileDisplayPref, setProfileDisplayPref] = useState<ProfileDisplayModePreference>(() =>
    getProfileDisplayModePreference(currentUser.id)
  );

  useEffect(() => {
    setProfileDisplayPref(getProfileDisplayModePreference(currentUser.id));
  }, [currentUser.id]);

  const [isCardExporting, setIsCardExporting] = useState(false);
  const [isMessageSettingsOpen, setIsMessageSettingsOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  };

  const handleOpenCategory = (id: SimpleCategoryId) => {
    setActiveCategory(id);
    setMobileView(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleLargeText = (nextLarge?: boolean) => {
    const target = typeof nextLarge === 'boolean' ? nextLarge : !isLargeText;
    setIsLargeText(target);
    try {
      localStorage.setItem('szmc_text_size', target ? 'large' : 'normal');
      document.documentElement.style.fontSize = target ? '112.5%' : '';
    } catch {}
    showToast(target ? 'Saved: Larger text is now ON' : 'Saved: Normal text size');
  };

  const handleQuickThemeToggle = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next as any);
    showToast(next === 'dark' ? 'Saved: Dark screen is ON' : 'Saved: Light screen is ON');
  };

  const handleSelectVisualMode = (mode: 'classic' | 'glass' | 'clear-glass') => {
    setVisualMode(mode);
    showToast(
      mode === 'clear-glass'
        ? 'Saved: Clear Transparent Glass is ON'
        : mode === 'glass'
        ? 'Saved: Soft Glass mode is ON'
        : 'Saved: Classic look is active'
    );
  };

  const handleQuickGlassToggle = () => {
    const nextMode =
      visualMode === 'classic'
        ? 'glass'
        : visualMode === 'glass'
        ? 'clear-glass'
        : 'classic';
    toggleGlassMode();
    showToast(
      nextMode === 'glass'
        ? 'Glass Mode ON — tap again for Clear Transparent Glass'
        : nextMode === 'clear-glass'
        ? 'Clear Transparent Glass ON — tap again for Classic'
        : 'Switched back to Classic look'
    );
  };

  const handleSelectProfileDisplayMode = (modeId: ProfileDisplayModeId, modeName: string) => {
    const saved = saveProfileDisplayModePreference(currentUser.id, { modeId });
    setProfileDisplayPref(saved);
    showToast(`Saved: Profile style set to ${modeName}`);
  };

  const handleSelectProfileDisplayScope = (visitorScope: ProfileDisplayModeScope) => {
    const saved = saveProfileDisplayModePreference(currentUser.id, { visitorScope });
    setProfileDisplayPref(saved);
    const scopeLabel =
      visitorScope === 'everyone'
        ? 'Everyone'
        : visitorScope === 'alumni_only'
        ? 'Verified Alumni'
        : 'Only Me';
    showToast(`Saved: Profile style visible to ${scopeLabel}`);
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await updateProfile({
      fullName: editFullName.trim() || currentUser.fullName,
      profession: editProfession.trim(),
      position: editPosition.trim(),
      institution: editInstitution.trim(),
      city: editCity.trim(),
      country: editCountry.trim(),
      phone: editPhone.trim() || undefined,
      whatsapp: editWhatsapp.trim() || undefined,
      bio: editBio.trim() || undefined,
    });
    if (!res.success) {
      showToast(res.error || 'Could not save your profile changes. Please try again.');
      return;
    }
    setIsEditingPersonal(false);
    showToast('Saved! Your details are updated');
  };

  const syncPreferencesToBackend = React.useCallback(
    async (partialPrefs: Record<string, unknown>, extraProfileFields?: Record<string, unknown>) => {
      try {
        const headers = await getClientAuthHeaders();
        if (!headers.Authorization) return;
        const mergedPrefs = {
          contactAudience,
          institutionVisibility,
          notifications: notificationPreferences,
          bloodDonor: bloodDonorPreferences,
          language: languagePreference,
          ...partialPrefs,
        };
        await fetch('/api/profile/update', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: currentUser.id,
            userPreferences: mergedPrefs,
            ...(extraProfileFields || {}),
          }),
        }).catch(() => undefined);
      } catch {}
    },
    [
      currentUser.id,
      contactAudience,
      institutionVisibility,
      notificationPreferences,
      bloodDonorPreferences,
      languagePreference,
    ]
  );

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPassword) return;
    setPasswordChangeError(null);

    if (!newPassword || newPassword.length < 6) {
      setPasswordChangeError('Please choose a password with at least 6 letters or numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('The two new passwords do not match. Please check and try again.');
      return;
    }

    setIsSavingPassword(true);
    try {
      let updatedSomewhere = false;

      if (isSupabaseConfigured) {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        if (sessionData?.session?.access_token && sessionUser) {
          const providers = Array.isArray(sessionUser.app_metadata?.providers)
            ? sessionUser.app_metadata.providers
            : sessionUser.app_metadata?.provider
              ? [sessionUser.app_metadata.provider]
              : [];
          const hasPasswordProvider = providers.includes('email') || (!providers.length && Boolean(sessionUser.email));

          if (hasPasswordProvider && sessionUser.email) {
            if (!currentPassword.trim()) {
              setPasswordChangeError('Please enter your current password to verify it is you.');
              return;
            }
            const { error: reauthErr } = await supabase.auth.signInWithPassword({
              email: sessionUser.email,
              password: currentPassword,
            });
            if (reauthErr) {
              setPasswordChangeError('Your current password is incorrect. Please check and try again.');
              return;
            }
          }

          const { error: authErr } = await supabase.auth.updateUser({
            password: newPassword,
          });
          if (authErr) {
            setPasswordChangeError(authErr.message || 'Could not update your password.');
            return;
          }
          updatedSomewhere = true;
        }
      }

      const headers = await getClientAuthHeaders();
      if (headers.Authorization) {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: currentUser.phone || undefined,
            email: currentUser.email || undefined,
            currentPassword: currentPassword || undefined,
            newPassword,
          }),
        });
        if (res.ok) {
          updatedSomewhere = true;
        } else if (!updatedSomewhere) {
          const json = await res.json().catch(() => ({}));
          setPasswordChangeError(json?.error || 'Could not update password on server.');
          return;
        }
      }

      if (!updatedSomewhere) {
        setPasswordChangeError('Please sign in again before changing your password.');
        return;
      }

      setPasswordChangeSuccess(true);
      showToast('Saved! Your password has been updated');
      setTimeout(() => {
        setIsChangingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordChangeSuccess(false);
      }, 1200);
    } catch (err: any) {
      setPasswordChangeError(err?.message || 'Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const togglePublicDirectory = async () => {
    const nextVal = !(currentUser.isPublic !== false);
    const res = await updateProfile({ isPublic: nextVal });
    if (!res.success) {
      showToast(res.error || 'Could not update directory visibility.');
      return;
    }
    showToast(nextVal ? 'Saved: Your profile is visible in directory' : 'Saved: Your profile is hidden');
  };

  const updateContactAudience = (val: 'verified' | 'batch_only' | 'everyone' | 'private') => {
    setContactAudience(val);
    try {
      localStorage.setItem('szmc_settings_contact_audience', val);
    } catch {}
    const showToVerified = val !== 'private';
    void syncPreferencesToBackend(
      { contactAudience: val },
      { showContactToVerified: showToVerified }
    );
    const labels: Record<typeof val, string> = {
      verified: 'Verified Doctors',
      batch_only: `Batch ${currentUser.batchYear} Only`,
      everyone: 'All Members',
      private: 'Only You (Private)',
    };
    showToast(`Saved: Phone visible to ${labels[val]}`);
  };

  const toggleNotification = (key: keyof typeof notificationPreferences, label: string) => {
    setNotificationPreferences((prev: any) => {
      const nextVal = !prev[key];
      const next = { ...prev, [key]: nextVal };
      try {
        localStorage.setItem('szmc_settings_notifications', JSON.stringify(next));
      } catch {}
      void syncPreferencesToBackend({ notifications: next });
      showToast(`Saved: ${label} ${nextVal ? 'ON' : 'OFF'}`);
      return next;
    });
  };

  const toggleBloodDonorPreference = (key: keyof typeof bloodDonorPreferences, label: string) => {
    setBloodDonorPreferences((prev: any) => {
      const nextVal = !prev[key];
      const next = { ...prev, [key]: nextVal };
      try {
        localStorage.setItem('szmc_settings_blood_donor', JSON.stringify(next));
      } catch {}
      void syncPreferencesToBackend({ bloodDonor: next });
      showToast(`Saved: ${label} ${nextVal ? 'ON' : 'OFF'}`);
      return next;
    });
  };

  const handleDownloadIdCard = async () => {
    if (isCardExporting) return;
    setIsCardExporting(true);
    try {
      const shareUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}?card=${currentUser.id}`
          : 'https://szmcalumni.net/';
      const snap = await fetchSocialGraphSnapshot(currentUser.id, currentUser.id).catch(() => ({
        followersCount: 0,
        followingCount: 0,
      }));
      const blob = await renderFrostedProfileCardImage({
        profile: currentUser,
        metrics: {
          postsCount: currentUser.postsCount ?? 0,
          followersCount: snap.followersCount,
          followingCount: snap.followingCount,
        },
        shareUrl,
        theme: 'sapphire',
        styleId: 'present',
        format: 'jpg',
      });
      const safeName = currentUser.fullName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      triggerBlobDownload(
        blob,
        `SZMC_Alumni_Card_${safeName || currentUser.id}_Batch${currentUser.batchYear}.jpg`
      );
      showToast('Your high-quality JPG Alumni Card has been downloaded');
    } catch {
      showToast('Could not export Alumni Card JPG. Please try again.');
    } finally {
      setIsCardExporting(false);
    }
  };

  const handleExportFullData = () => {
    const fullData = {
      profile: currentUser,
      exportedAt: new Date().toISOString(),
      network: 'SZMC Alumni Portal',
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `szmc_my_copy_${currentUser.id}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('A copy of your profile was downloaded');
  };

  const handleDeleteProfile = async () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.');
      return;
    }
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteAccount(deletePasswordConfirm);
      setIsDeleteModalOpen(false);
      onNavigate('feed');
    } catch (err: any) {
      setDeleteError(err?.message || 'Could not delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const isVerified = currentUser.verificationStatus === 'verified';
  const currentDonor = getDonorProfileByUserId(currentUser.id);
  const activeMeta = SIMPLE_CATEGORIES.find((c) => c.id === activeCategory)!;

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950/70 pb-12 pt-2 sm:pt-4">
      {/* Reassuring Confirmation Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-50 w-max max-w-[calc(100vw-2rem)] sm:max-w-sm flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl text-sm font-semibold animate-in fade-in slide-in-from-bottom-3 duration-150"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span className="leading-snug">{toastMessage}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-6 space-y-5">
        {/* Clean Friendly Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <VerifiedAvatar
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              verificationStatus={currentUser.verificationStatus}
              profile={currentUser}
              size="lg"
              imgClassName="w-12 h-12 sm:w-14 sm:h-14"
              unverifiedClassName="rounded-full ring-2 ring-slate-200 dark:ring-slate-700"
            />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Settings
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                {currentUser.fullName} · Batch {currentUser.batchYear}
                {isVerified ? ' · Verified Doctor' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>View My Profile</span>
            </button>
          </div>
        </div>

        {/* INSTANT QUICK CONTROLS — 4 Big Interactive One-Tap Tiles */}
        <section
          aria-label="Quick Controls"
          className={`${mobileView !== 'home' ? 'hidden lg:block' : 'block'}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Quick Tile 1: App Style (Click 1 = Glass, Click 2 = Clear Glass, Click 3 = Classic) */}
            <button
              type="button"
              onClick={handleQuickGlassToggle}
              className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.98] ${
                isClearGlassMode
                  ? 'border-violet-400 dark:border-violet-400/70 bg-violet-50/70 dark:bg-violet-950/40 text-slate-900 dark:text-white'
                  : isGlassMode
                  ? 'border-sky-400 dark:border-sky-400/70 bg-sky-50/70 dark:bg-sky-950/40 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-sky-300'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isClearGlassMode
                      ? 'bg-gradient-to-br from-violet-500 via-sky-500 to-teal-400 text-white shadow-sm'
                      : isGlassMode
                      ? 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm'
                      : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400'
                  }`}
                >
                  {isClearGlassMode ? (
                    <Sparkles className="w-5 h-5" />
                  ) : (
                    <Droplets className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug">Glass Mode</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {isClearGlassMode
                      ? 'Clear transparent · Tap for Off'
                      : isGlassMode
                      ? 'Soft glass · Tap for Clear'
                      : 'Off · Tap for Glass'}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                  isClearGlassMode
                    ? 'text-violet-600 dark:text-violet-300'
                    : isGlassMode
                    ? 'text-sky-600 dark:text-sky-300'
                    : 'text-slate-400'
                }`}
              >
                {isClearGlassMode ? 'CLEAR' : isGlassMode ? 'GLASS' : 'OFF'}
              </span>
            </button>

            {/* Quick Tile 2: Light / Dark Screen */}
            <button
              type="button"
              onClick={handleQuickThemeToggle}
              className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.98] ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-200 text-slate-900 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isDark
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug">Screen Mode</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isDark ? 'Dark Screen' : 'Bright Light'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                Switch
              </span>
            </button>

            {/* Quick Tile 2: Bigger Text for Easy Reading */}
            <button
              type="button"
              onClick={() => handleToggleLargeText()}
              className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.98] ${
                isLargeText
                  ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isLargeText
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Type className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug">Larger Text</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {isLargeText ? 'Bigger & easier to read' : 'Normal size'}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                  isLargeText ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                }`}
              >
                {isLargeText ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Quick Tile 3: Sound ON / OFF */}
            <button
              type="button"
              onClick={() => toggleNotification('soundEnabled', 'Alert Sound')}
              className={`min-h-[76px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.98] ${
                notificationPreferences.soundEnabled
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-400/70 dark:border-emerald-800 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    notificationPreferences.soundEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {notificationPreferences.soundEnabled ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <VolumeX className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug">Alert Sound</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {notificationPreferences.soundEnabled ? 'Plays gentle chime' : 'Muted (Silent)'}
                  </div>
                </div>
              </div>
              <span
                className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                  notificationPreferences.soundEnabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                {notificationPreferences.soundEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </section>

        {/* COMPACT LIVE THEME PREVIEW CARD — Classic vs Soft Glass vs Clear Transparent Glass */}
        <section
          aria-label="Glass Mode Visual Preview"
          className={`${mobileView !== 'home' ? 'hidden lg:block' : 'block'}`}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Theme Preview
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  · {isDark ? 'Dark Theme' : 'Light Theme'}
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tap any preview or click Glass Mode to cycle
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Preview 1: Classic (Glass OFF) */}
              <button
                type="button"
                onClick={() => handleSelectVisualMode('classic')}
                className={`glass-preview-solid group text-left rounded-xl p-2.5 border-2 transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  visualMode === 'classic'
                    ? 'border-blue-600 bg-slate-100 dark:bg-slate-950'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                      Classic
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      visualMode === 'classic'
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {visualMode === 'classic' && <Check className="w-3.5 h-3.5" />}
                    OFF
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {currentUser.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Solid surface
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-md bg-blue-600 text-white text-[10px] font-bold shrink-0">
                    Post
                  </span>
                </div>
              </button>

              {/* Preview 2: Present Glass Mode (Click 1) */}
              <button
                type="button"
                onClick={() => handleSelectVisualMode('glass')}
                className={`glass-preview-crystal group text-left rounded-xl p-2.5 border-2 transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isDark ? 'glass-preview-canvas-dark' : 'glass-preview-canvas-light'
                } ${
                  visualMode === 'glass'
                    ? 'border-sky-500'
                    : isDark
                    ? 'border-white/15 hover:border-sky-400/60'
                    : 'border-white/70 hover:border-sky-400'
                }`}
              >
                <div
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg mb-2 ${
                    isDark ? 'glass-preview-pane-dark' : 'glass-preview-pane-light'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Droplets
                      className={`w-3 h-3 ${isDark ? 'text-sky-300' : 'text-sky-600'}`}
                    />
                    <span
                      className={`text-[11px] font-bold ${
                        isDark ? 'text-white' : 'text-[#0b1528]'
                      }`}
                    >
                      Soft Glass
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      visualMode === 'glass'
                        ? isDark
                          ? 'text-sky-300'
                          : 'text-sky-700'
                        : isDark
                        ? 'text-slate-300'
                        : 'text-slate-600'
                    }`}
                  >
                    {visualMode === 'glass' && <Check className="w-3.5 h-3.5" />}
                    1st Tap
                  </span>
                </div>

                <div
                  className={`p-2.5 rounded-lg flex items-center justify-between gap-2 ${
                    isDark ? 'glass-preview-pane-dark' : 'glass-preview-pane-light'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-white/70 shrink-0"
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-bold truncate ${
                          isDark ? 'text-white' : 'text-[#0b1528]'
                        }`}
                      >
                        {currentUser.fullName}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          isDark ? 'text-slate-200' : 'text-[#334155]'
                        }`}
                      >
                        Frosted glass
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md text-[10px] font-bold shrink-0 border ${
                      isDark
                        ? 'bg-sky-400/25 border-sky-300/40 text-white'
                        : 'bg-blue-600/85 border-white/60 text-white'
                    }`}
                  >
                    Post
                  </span>
                </div>
              </button>

              {/* Preview 3: Clear Transparent Glass (Click 2 — Liquid Glass UI Kit style) */}
              <button
                type="button"
                onClick={() => handleSelectVisualMode('clear-glass')}
                className={`glass-preview-crystal group text-left rounded-xl p-2.5 border-2 transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  isDark ? 'glass-preview-clear-canvas-dark' : 'glass-preview-clear-canvas-light'
                } ${
                  visualMode === 'clear-glass'
                    ? 'border-violet-500'
                    : isDark
                    ? 'border-white/20 hover:border-violet-400/70'
                    : 'border-white/85 hover:border-violet-400'
                }`}
              >
                <div
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg mb-2 ${
                    isDark ? 'glass-preview-clear-pane-dark' : 'glass-preview-clear-pane-light'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles
                      className={`w-3 h-3 ${isDark ? 'text-violet-300' : 'text-violet-600'}`}
                    />
                    <span
                      className={`text-[11px] font-bold ${
                        isDark ? 'text-white' : 'text-[#0b1220]'
                      }`}
                    >
                      Clear Glass
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      visualMode === 'clear-glass'
                        ? isDark
                          ? 'text-violet-300'
                          : 'text-violet-700'
                        : isDark
                        ? 'text-slate-200'
                        : 'text-slate-700'
                    }`}
                  >
                    {visualMode === 'clear-glass' && <Check className="w-3.5 h-3.5" />}
                    2nd Tap
                  </span>
                </div>

                <div
                  className={`p-2.5 rounded-lg flex items-center justify-between gap-2 ${
                    isDark ? 'glass-preview-clear-pane-dark' : 'glass-preview-clear-pane-light'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={currentUser.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-white/85 shrink-0"
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-bold truncate ${
                          isDark ? 'text-white' : 'text-[#0b1220]'
                        }`}
                      >
                        {currentUser.fullName}
                      </div>
                      <div
                        className={`text-[11px] truncate ${
                          isDark ? 'text-slate-200' : 'text-[#334155]'
                        }`}
                      >
                        Ultra-clear glass
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold shrink-0 text-white border border-white/60 bg-gradient-to-r from-violet-500/85 to-sky-500/80 shadow-sm">
                    Post
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* MAIN 2-COLUMN LAYOUT: 4 Clear Categories on Left + Focused Content on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT NAVIGATION — Always visible on Desktop, acts as Settings Home on Mobile */}
          <nav
            aria-label="Settings Categories"
            className={`lg:col-span-4 space-y-2.5 ${
              mobileView !== 'home' ? 'hidden lg:block' : 'block'
            }`}
          >
            {SIMPLE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleOpenCategory(cat.id)}
                  className={`w-full min-h-[78px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3.5 transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? 'lg:bg-blue-600 lg:border-blue-600 lg:text-white bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-white hover:border-blue-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? `lg:bg-white/20 lg:text-white ${cat.iconBgClass}`
                          : cat.iconBgClass
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-bold leading-snug">{cat.title}</div>
                      <div
                        className={`text-xs sm:text-sm mt-0.5 leading-snug ${
                          isSelected
                            ? 'lg:text-blue-100 text-slate-500 dark:text-slate-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {cat.subtitle}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 shrink-0 ${
                      isSelected ? 'lg:text-white text-slate-400' : 'text-slate-400'
                    }`}
                  />
                </button>
              );
            })}

            {/* Easy One-Tap Sign Out Shortcut on Mobile Home */}
            <div className="pt-2 lg:hidden">
              <button
                type="button"
                onClick={() => {
                  logout();
                  onNavigate('feed');
                }}
                className="w-full min-h-[54px] px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 text-base font-bold flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </nav>

          {/* RIGHT CONTENT PANE — Always visible on Desktop, slides open with Back button on Mobile */}
          <div
            className={`lg:col-span-8 space-y-5 ${
              mobileView === 'home' ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Unmistakable Mobile Back Button */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => {
                  setMobileView('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
              >
                <ChevronLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Back to All Settings</span>
              </button>
            </div>

            {/* ============================================================== */}
            {/* CATEGORY 1: MY INFO & ID CARD                                  */}
            {/* ============================================================== */}
            {activeCategory === 'profile' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 space-y-7">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {activeMeta.title}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Keep your contact and hospital details up to date for classmates.
                    </p>
                  </div>

                  {!isEditingPersonal && (
                    <button
                      type="button"
                      onClick={() => setIsEditingPersonal(true)}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors cursor-pointer active:scale-95 whitespace-nowrap self-start sm:self-auto"
                    >
                      Edit My Info
                    </button>
                  )}
                </div>

                {/* Personal Info Form or Easy Read List */}
                {isEditingPersonal ? (
                  <form onSubmit={handleSavePersonal} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Designation / Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Professor, Consultant, Medical Officer"
                          value={editPosition}
                          onChange={(e) => setEditPosition(e.target.value)}
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Hospital or Workplace
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. SZMCH, Bogura"
                          value={editInstitution}
                          onChange={(e) => setEditInstitution(e.target.value)}
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Specialty
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Medicine, Surgery, Cardiology"
                          value={editProfession}
                          onChange={(e) => setEditProfession(e.target.value)}
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="+8801700000000"
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          WhatsApp Number
                        </label>
                        <input
                          type="tel"
                          value={editWhatsapp}
                          onChange={(e) => setEditWhatsapp(e.target.value)}
                          placeholder="+8801700000000"
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          City
                        </label>
                        <input
                          type="text"
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          placeholder="e.g. Bogura, Dhaka"
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Country
                        </label>
                        <input
                          type="text"
                          value={editCountry}
                          onChange={(e) => setEditCountry(e.target.value)}
                          className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Short Bio (Optional)
                      </label>
                      <textarea
                        rows={3}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Write a short line about your medical career or interests."
                        className="w-full px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingPersonal(false)}
                        className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer active:scale-95 transition-transform"
                      >
                        Save My Info
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm sm:text-base">
                    {[
                      { label: 'Full Name', value: currentUser.fullName },
                      {
                        label: 'Batch',
                        value: `Batch ${currentUser.batchYear} · ${currentUser.session || 'MBBS'}`,
                      },
                      {
                        label: 'Designation',
                        value: currentUser.position || currentUser.profession || 'Physician',
                      },
                      {
                        label: 'Hospital',
                        value: currentUser.institution || 'Shaheed Ziaur Rahman Medical College Hospital',
                      },
                      { label: 'Phone', value: currentUser.phone || 'Not added yet' },
                      { label: 'Email', value: currentUser.email || 'Not added yet' },
                      {
                        label: 'Blood Group',
                        value: currentUser.bloodGroup || currentDonor?.bloodGroup || 'Not set',
                        accent: true,
                      },
                      {
                        label: 'Location',
                        value: `${currentUser.city || 'Bogura'}, ${currentUser.country || 'Bangladesh'}`,
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4"
                      >
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {row.label}
                        </span>
                        <span
                          className={`font-semibold sm:text-right ${
                            row.accent
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Alumni Verification Status — Simple & Clear */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <BadgeCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        {isVerified ? 'Verified SZMC Alumni' : 'Verification Pending'}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                        {isVerified
                          ? 'Your identity is confirmed. You can also help verify classmates.'
                          : 'Confirm your SZMC batch identity to unlock all features.'}
                      </p>
                    </div>
                  </div>
                  {onOpenVerificationCenter && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenVerificationCenter(isVerified ? 'vouch_classmates' : 'status')
                      }
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0"
                    >
                      {isVerified ? 'Verify Classmates' : 'Verify Now'}
                    </button>
                  )}
                </div>

                {/* Official Alumni Digital ID Card */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    My Digital Alumni Card
                  </div>
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-white/15 p-1.5 border border-white/20 flex items-center justify-center shrink-0">
                        <SZMCLogo className="w-full h-full" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold truncate">{currentUser.fullName}</div>
                        <div className="text-sm text-blue-100">
                          SZMC Batch {currentUser.batchYear} · ID #{currentUser.id}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isCardExporting}
                      onClick={handleDownloadIdCard}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isCardExporting ? 'Downloading...' : 'Download Card'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* CATEGORY 2: SCREEN & LANGUAGE                                  */}
            {/* ============================================================== */}
            {activeCategory === 'display' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 space-y-7">
                <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {activeMeta.title}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Make the screen comfortable for your eyes. Every tap saves automatically.
                  </p>
                </div>

                {/* Step 1: App Visual Style — Classic vs Soft Glass vs Clear Transparent Glass */}
                <div className="space-y-3.5">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      <span>1. App Appearance Style</span>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Choose Classic, Soft Glass, or Ultra-Clear Transparent Glass.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {/* Classic Look Card */}
                    <button
                      type="button"
                      onClick={() => handleSelectVisualMode('classic')}
                      className={`text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer active:scale-[0.99] ${
                        visualMode === 'classic'
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {/* Solid Classic Visual Preview */}
                      <div className="glass-preview-solid h-24 rounded-xl p-2.5 mb-3 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-hidden">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-white">
                              <Layers className="w-3 h-3" />
                            </div>
                            <div className="w-12 h-2 rounded-full bg-slate-800/80 dark:bg-slate-200/80" />
                          </div>
                          {visualMode === 'classic' && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                              <Check className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                        </div>
                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                          <div className="space-y-1 flex-1">
                            <div className="w-16 h-1.5 rounded-full bg-slate-700/70 dark:bg-slate-300/70" />
                            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        Classic
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                        Crisp, solid standard look.
                      </p>
                    </button>

                    {/* Soft Liquid Glass Card (Present Glass Mode) */}
                    <button
                      type="button"
                      onClick={() => handleSelectVisualMode('glass')}
                      className={`text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer active:scale-[0.99] ${
                        visualMode === 'glass'
                          ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-sky-300'
                      }`}
                    >
                      <div
                        className={`glass-preview-crystal relative h-24 rounded-xl p-2.5 mb-3 overflow-hidden border flex flex-col justify-between ${
                          isDark
                            ? 'glass-preview-canvas-dark border-white/20'
                            : 'glass-preview-canvas-light border-white/80'
                        }`}
                      >
                        <div className="relative z-10 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center ${
                                isDark
                                  ? 'glass-preview-pane-dark text-sky-300'
                                  : 'glass-preview-pane-light text-sky-700'
                              }`}
                            >
                              <Droplets className="w-3 h-3" />
                            </div>
                            <div
                              className={`w-12 h-2 rounded-full ${
                                isDark ? 'bg-white/85' : 'bg-slate-900/70'
                              }`}
                            />
                          </div>
                          {visualMode === 'glass' && (
                            <span
                              className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
                                isDark ? 'text-sky-300' : 'text-sky-700'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                        </div>

                        <div
                          className={`relative z-10 p-2 rounded-lg flex items-center gap-2 ${
                            isDark ? 'glass-preview-pane-dark' : 'glass-preview-pane-light'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full shrink-0 border ${
                              isDark
                                ? 'bg-white/25 border-white/40'
                                : 'bg-white/75 border-white'
                            }`}
                          />
                          <div className="space-y-1 flex-1">
                            <div
                              className={`w-16 h-1.5 rounded-full ${
                                isDark ? 'bg-white/85' : 'bg-slate-900/70'
                              }`}
                            />
                            <div
                              className={`w-10 h-1.5 rounded-full ${
                                isDark ? 'bg-white/45' : 'bg-slate-600/45'
                              }`}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        Soft Glass
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                        Gentle frosted glass (1st tap).
                      </p>
                    </button>

                    {/* Ultra-Clear Transparent Glass Card (Liquid Glass UI Kit style) */}
                    <button
                      type="button"
                      onClick={() => handleSelectVisualMode('clear-glass')}
                      className={`text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer active:scale-[0.99] ${
                        visualMode === 'clear-glass'
                          ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-violet-300'
                      }`}
                    >
                      <div
                        className={`glass-preview-crystal relative h-24 rounded-xl p-2.5 mb-3 overflow-hidden border flex flex-col justify-between ${
                          isDark
                            ? 'glass-preview-clear-canvas-dark border-white/25'
                            : 'glass-preview-clear-canvas-light border-white/90'
                        }`}
                      >
                        <div className="relative z-10 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center ${
                                isDark
                                  ? 'glass-preview-clear-pane-dark text-violet-300'
                                  : 'glass-preview-clear-pane-light text-violet-600'
                              }`}
                            >
                              <Sparkles className="w-3 h-3" />
                            </div>
                            <div
                              className={`w-12 h-2 rounded-full ${
                                isDark ? 'bg-white/90' : 'bg-slate-900/80'
                              }`}
                            />
                          </div>
                          {visualMode === 'clear-glass' && (
                            <span
                              className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
                                isDark ? 'text-violet-300' : 'text-violet-700'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                        </div>

                        <div
                          className={`relative z-10 p-2 rounded-lg flex items-center justify-between gap-2 ${
                            isDark ? 'glass-preview-clear-pane-dark' : 'glass-preview-clear-pane-light'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-4 h-4 rounded-full shrink-0 bg-gradient-to-br from-violet-500/80 to-teal-400/80 border border-white/75" />
                            <div className="space-y-1">
                              <div
                                className={`w-12 h-1.5 rounded-full ${
                                  isDark ? 'bg-white/90' : 'bg-slate-900/80'
                                }`}
                              />
                              <div
                                className={`w-8 h-1.5 rounded-full ${
                                  isDark ? 'bg-white/45' : 'bg-slate-700/45'
                                }`}
                              />
                            </div>
                          </div>
                          <div className="w-6 h-3 rounded-full bg-gradient-to-r from-violet-500/85 to-sky-400/85 border border-white/70 shrink-0" />
                        </div>
                      </div>

                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        Clear Glass
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                        Ultra-clear specular glass (2nd tap).
                      </p>
                    </button>
                  </div>
                </div>

                {/* Step 2: Text Size (Huge win for senior users) */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    2. Text Size
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleLargeText(false)}
                      className={`min-h-[68px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                        !isLargeText
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-base font-bold">Normal Size</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Standard everyday reading size
                        </div>
                      </div>
                      {!isLargeText && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleLargeText(true)}
                      className={`min-h-[68px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                        isLargeText
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-lg font-bold">Large Text</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Bigger words, easier on the eyes
                        </div>
                      </div>
                      {isLargeText && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />}
                    </button>
                  </div>
                </div>

                {/* Step 3: Screen Brightness (Light or Dark — works with both Classic & Glass) */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    3. Screen Color
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: 'light',
                        name: 'Light Screen',
                        desc: isGlassMode ? 'Airy bright crystal glass' : 'Bright & crisp for daytime',
                        icon: Sun,
                      },
                      {
                        id: 'dark',
                        name: 'Dark Screen',
                        desc: isGlassMode ? 'Deep aurora dark glass' : 'Soft & restful at night',
                        icon: Moon,
                      },
                    ].map((t) => {
                      const active = (t.id === 'dark') === isDark;
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTheme(t.id as any);
                            showToast(`Saved: ${t.name} is active`);
                          }}
                          className={`min-h-[72px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                            active
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 text-slate-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-base font-bold">{t.name}</div>
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                {t.desc}
                              </div>
                            </div>
                          </div>
                          {active && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 4: Language */}
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span>4. Language / ভাষা</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setLanguagePreference('en');
                        try {
                          localStorage.setItem('szmc_settings_lang', 'en');
                        } catch {}
                        void syncPreferencesToBackend({ language: 'en' });
                        showToast('Saved: Language set to English');
                      }}
                      className={`min-h-[68px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                        languagePreference === 'en'
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          English
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Standard portal language
                        </div>
                      </div>
                      {languagePreference === 'en' && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLanguagePreference('bn');
                        try {
                          localStorage.setItem('szmc_settings_lang', 'bn');
                        } catch {}
                        void syncPreferencesToBackend({ language: 'bn' });
                        showToast('ভাষা বাংলা হিসেবে সংরক্ষিত হয়েছে');
                      }}
                      className={`min-h-[68px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99] ${
                        languagePreference === 'bn'
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          বাংলা (Bengali)
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          শহীদ জিয়াউর রহমান মেডিকেল কলেজ
                        </div>
                      </div>
                      {languagePreference === 'bn' && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 5: Profile Look (Present Mode / Glass Mode) */}
                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      5. How Your Profile Looks
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Pick the style you prefer for your own profile page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {PROFILE_DISPLAY_MODES.filter((m) => m.status === 'available').map((mode) => {
                      const isSelected = profileDisplayPref.modeId === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => handleSelectProfileDisplayMode(mode.id, mode.name)}
                          className={`text-left rounded-2xl border-2 p-4 transition-all cursor-pointer active:scale-[0.99] ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`h-16 rounded-xl p-2.5 mb-3 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between overflow-hidden ${mode.previewBgClass}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full ${mode.previewAccentClass}`} />
                              <div className="space-y-1.5">
                                <div className="w-20 h-2 rounded-full bg-slate-900/20 dark:bg-white/30" />
                                <div className="w-12 h-1.5 rounded-full bg-slate-900/10 dark:bg-white/20" />
                              </div>
                            </div>
                            {isSelected && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-300">
                                <Check className="w-4 h-4" />
                                Selected
                              </span>
                            )}
                          </div>
                          <div className="text-base font-bold text-slate-900 dark:text-white">
                            {mode.name}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                            {mode.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Who sees this style */}
                  <div className="space-y-2 pt-1">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Who sees your profile in this style?
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'everyone', label: 'Everyone' },
                          { id: 'alumni_only', label: 'SZMC Alumni' },
                          { id: 'self_only', label: 'Only Me' },
                        ] as const
                      ).map((opt) => {
                        const active = profileDisplayPref.visitorScope === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSelectProfileDisplayScope(opt.id)}
                            className={`min-h-[46px] px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* CATEGORY 3: PRIVACY & ALERTS                                   */}
            {/* ============================================================== */}
            {activeCategory === 'privacy' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 space-y-6">
                <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {activeMeta.title}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Tap any switch to turn it ON or OFF. Changes save right away.
                  </p>
                </div>

                {/* Simple ON/OFF Switches */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  <SimpleSwitchRow
                    title="Show me in Alumni Directory"
                    description="Let fellow doctors and classmates find your profile by name or batch."
                    checked={currentUser.isPublic !== false}
                    onToggle={togglePublicDirectory}
                  />

                  <SimpleSwitchRow
                    title="Show my hospital on Alumni Map"
                    description={`Pin ${currentUser.institution || 'your workplace'} on the alumni map.`}
                    checked={institutionVisibility === 'public'}
                    onToggle={() => {
                      const next = institutionVisibility === 'public' ? 'verified_only' : 'public';
                      setInstitutionVisibility(next);
                      try {
                        localStorage.setItem('szmc_settings_inst_visibility', next);
                      } catch {}
                      showToast(
                        next === 'public'
                          ? 'Saved: Hospital map pin is ON'
                          : 'Saved: Hospital map pin is restricted'
                      );
                    }}
                  />

                  <SimpleSwitchRow
                    title={`Emergency Blood Donor (${currentUser.bloodGroup || 'Available'})`}
                    description="Allow coordinators to contact you during urgent blood needs."
                    checked={bloodDonorPreferences.isAvailable}
                    onToggle={() => toggleBloodDonorPreference('isAvailable', 'Blood Donor')}
                    accentColor="rose"
                  />

                  <SimpleSwitchRow
                    title="Batch & College Notices"
                    description="Receive reunion dates and official SZMC announcements."
                    checked={notificationPreferences.batchAnnouncements}
                    onToggle={() => toggleNotification('batchAnnouncements', 'College Notices')}
                  />

                  <SimpleSwitchRow
                    title="Urgent Blood Calls"
                    description="Get notified when someone nearby needs your blood group."
                    checked={notificationPreferences.bloodEmergencyCalls}
                    onToggle={() => toggleNotification('bloodEmergencyCalls', 'Blood Alerts')}
                    accentColor="rose"
                  />

                  <SimpleSwitchRow
                    title="Likes & Comments"
                    description="Know when colleagues comment on or react to your posts."
                    checked={notificationPreferences.postComments}
                    onToggle={() => toggleNotification('postComments', 'Post Alerts')}
                  />

                  <SimpleSwitchRow
                    title="Notification Sound"
                    description="Play a gentle chime for new messages and alerts."
                    checked={notificationPreferences.soundEnabled}
                    onToggle={() => toggleNotification('soundEnabled', 'Alert Sound')}
                    accentColor="emerald"
                  />
                </div>

                {/* Who Can See Your Phone Number */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      Who can see your phone &amp; email?
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      Pick who is allowed to view your contact numbers.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { id: 'verified', label: 'Verified Doctors', sub: 'Best balance of privacy' },
                      {
                        id: 'batch_only',
                        label: `Only Batch ${currentUser.batchYear}`,
                        sub: 'Only your own batchmates',
                      },
                      { id: 'everyone', label: 'All SZMC Members', sub: 'Any logged-in member' },
                      { id: 'private', label: 'Only Me (Hidden)', sub: 'Keep numbers private' },
                    ].map((opt) => {
                      const active = contactAudience === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateContactAudience(opt.id as any)}
                          className={`min-h-[64px] p-4 rounded-2xl border-2 text-left flex items-center justify-between gap-2 transition-all cursor-pointer active:scale-[0.99] ${
                            active
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                              {opt.label}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {opt.sub}
                            </div>
                          </div>
                          {active && (
                            <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chat Privacy & Blood Network Shortcuts */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMessageSettingsOpen(true)}
                    className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <MessageSquare className="w-5 h-5" />
                    <span>Chat &amp; Blocked List</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('emergency')}
                    className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <Heart className="w-5 h-5" />
                    <span>Open Blood Network</span>
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* CATEGORY 4: PASSWORD & SIGN OUT                                */}
            {/* ============================================================== */}
            {activeCategory === 'account' && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 space-y-6">
                <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {activeMeta.title}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Update your login password or sign out of this device safely.
                  </p>
                </div>

                {/* Change Password Row */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        Change Your Password
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Pick an easy-to-remember password that keeps your account safe.
                      </p>
                    </div>
                    {!isChangingPassword && (
                      <button
                        type="button"
                        onClick={() => setIsChangingPassword(true)}
                        className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer active:scale-95 transition-transform self-start sm:self-auto whitespace-nowrap"
                      >
                        Change Password
                      </button>
                    )}
                  </div>

                  {isChangingPassword && (
                    <form
                      onSubmit={handleSavePassword}
                      className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800"
                    >
                      {passwordChangeError && (
                        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 font-semibold">
                          {passwordChangeError}
                        </div>
                      )}

                      {passwordChangeSuccess && (
                        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                          <span>Your password has been updated!</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Current Password
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Type your current password"
                            className="w-full min-h-[48px] pl-4 pr-20 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[38px] px-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
                          >
                            {showCurrentPassword ? (
                              <>
                                <EyeOff className="w-4 h-4" />
                                <span>Hide</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-4 h-4" />
                                <span>Show</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                            New Password
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="At least 6 characters"
                              className="w-full min-h-[48px] pl-4 pr-20 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[38px] px-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer"
                            >
                              {showNewPassword ? (
                                <>
                                  <EyeOff className="w-4 h-4" />
                                  <span>Hide</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-4 h-4" />
                                  <span>Show</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                            Type New Password Again
                          </label>
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat new password"
                            className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsChangingPassword(false)}
                          className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingPassword}
                          className="min-h-[48px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold cursor-pointer active:scale-95 transition-transform"
                        >
                          {isSavingPassword ? 'Saving...' : 'Save New Password'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Sign Out Row — Clear and Easy to Find */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      Sign Out of This Device
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      You can sign back in anytime with your email or phone number.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      onNavigate('feed');
                    }}
                    className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all whitespace-nowrap self-start sm:self-auto"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>

                {/* Collapsible More Options (Keeps scary Danger Zone tucked away until requested) */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedAccount((prev) => !prev)}
                    aria-expanded={showAdvancedAccount}
                    className="w-full min-h-[48px] flex items-center justify-between gap-2 text-left text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>More Account Options (Download Data, Pause, or Delete)</span>
                    <ChevronDown
                      className={`w-5 h-5 transition-transform duration-150 ${
                        showAdvancedAccount ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showAdvancedAccount && (
                    <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                      {/* Export Data */}
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            Download a Copy of My Info
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Save your profile details to your phone or computer.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleExportFullData}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto whitespace-nowrap"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Copy</span>
                        </button>
                      </div>

                      {/* Temporary Pause */}
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            Take a Break (Hide Account)
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Temporarily hide your profile until you sign back in.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateProfile({ isPublic: false });
                            logout();
                            onNavigate('feed');
                          }}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold cursor-pointer self-start sm:self-auto whitespace-nowrap"
                        >
                          Hide &amp; Sign Out
                        </button>
                      </div>

                      {/* Permanent Delete */}
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                            Permanently Delete Account
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Remove your profile and alumni records forever.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteConfirmationText('');
                            setDeletePasswordConfirm('');
                            setIsDeleteModalOpen(true);
                          }}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto whitespace-nowrap"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Account</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal (Mobile Bottom Sheet + Desktop Centered) */}
      {isDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 pb-safe sm:p-7 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5"
          >
            <div className="sm:hidden flex justify-center -mt-2 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Delete Your Account?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  This will permanently remove <strong className="text-slate-900 dark:text-white">{currentUser.fullName}</strong>. It cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-sm font-semibold text-rose-700 dark:text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Type <span className="text-rose-600 font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Password (Optional):
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={deletePasswordConfirm}
                  onChange={(e) => setDeletePasswordConfirm(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 text-base bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting || deleteConfirmationText.trim().toUpperCase() !== 'DELETE'}
                onClick={handleDeleteProfile}
                className={`min-h-[48px] px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
                  deleteConfirmationText.trim().toUpperCase() === 'DELETE' && !isDeleting
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-rose-300 dark:bg-rose-950 text-rose-100 dark:text-rose-400 cursor-not-allowed opacity-60'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <MessageSettingsModal
        isOpen={isMessageSettingsOpen}
        onClose={() => setIsMessageSettingsOpen(false)}
        profileId={currentUser.id}
        batchYear={currentUser.batchYear}
      />
    </div>
  );
};
