import React, { useState, useMemo } from 'react';
import {
  Settings,
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
  Key,
  Smartphone,
  ChevronRight,
  Check,
  Search,
  AlertCircle,
  FileText,
  Share2,
  CheckCircle2,
  X,
  RefreshCw,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Award,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Sliders,
  BadgeCheck,
  Building,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AlumniProfile, SPECIALTIES_LIST, DEGREES_LIST } from '../types';
import { NDCLogo } from './NDCLogo';
import { loadVouchRequests } from '../utils/verificationService';
import { getDonorProfileByUserId } from '../utils/bloodDonationService';

interface SettingsViewProps {
  onNavigate: (route: string) => void;
  onOpenVerificationCenter?: (tab?: 'status' | 'vouch_classmates' | 'upload_id' | 'policy') => void;
  onBack?: () => void;
}

type SettingsSectionId =
  | 'personal'
  | 'security'
  | 'privacy'
  | 'blood'
  | 'notifications'
  | 'verification'
  | 'appearance'
  | 'data'
  | 'account';

interface SettingsSectionMeta {
  id: SettingsSectionId;
  title: string;
  shortTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  keywords: string[];
}

const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: 'personal',
    title: 'Personal Details & Professional Info',
    shortTitle: 'Personal details',
    icon: User,
    description: 'Name, medical designation, batch, BMDC number, contact details and practice location.',
    keywords: ['name', 'bmdc', 'batch', 'email', 'phone', 'hospital', 'profession', 'specialty', 'degree', 'whatsapp'],
  },
  {
    id: 'security',
    title: 'Password and Security',
    shortTitle: 'Password & security',
    icon: Lock,
    description: 'Manage your login password, two-factor authentication, and recognized devices.',
    keywords: ['password', '2fa', 'security', 'login', 'sessions', 'devices', 'two-factor', 'alerts'],
  },
  {
    id: 'privacy',
    title: 'Privacy and Directory Visibility',
    shortTitle: 'Privacy & audience',
    icon: Eye,
    description: 'Choose who can find your profile in the directory and who sees your phone & email.',
    keywords: ['privacy', 'visibility', 'public', 'search', 'directory', 'contact audience', 'who can see'],
  },
  {
    id: 'blood',
    title: 'Emergency Blood Donor Settings',
    shortTitle: 'Blood network',
    icon: Heart,
    description: 'Availability status, hospital corridors (Bogura, Rajshahi, Dhaka), and plasma/platelet donor options.',
    keywords: ['blood', 'donor', 'emergency', 'plasma', 'platelets', 'corridor', 'transfusion', 'hospital'],
  },
  {
    id: 'notifications',
    title: 'Notifications and Alerts',
    shortTitle: 'Notifications',
    icon: Bell,
    description: 'Set your preferences for batch notices, emergency blood broadcasts, peer vouches, and quad posts.',
    keywords: ['notifications', 'alerts', 'email', 'sms', 'push', 'sounds', 'vibrate', 'notices'],
  },
  {
    id: 'verification',
    title: 'Alumni Verification & Badges',
    shortTitle: 'Verification & badges',
    icon: BadgeCheck,
    description: 'Review your verification status, peer vouches, and request special leadership badges.',
    keywords: ['verify', 'verification', 'badge', 'vouch', 'id card', 'souvenir', 'representative'],
  },
  {
    id: 'appearance',
    title: 'Theme, Language & Display',
    shortTitle: 'Theme & display',
    icon: Globe,
    description: 'Customize light/dark theme, language, and layout density.',
    keywords: ['theme', 'dark mode', 'light', 'language', 'bangla', 'english', 'display'],
  },
  {
    id: 'data',
    title: 'Your Information & Data Download',
    shortTitle: 'Your data & card',
    icon: Download,
    description: 'Download your official SZMC Alumni Digital ID Card and export a copy of your profile data.',
    keywords: ['download', 'id card', 'export', 'data', 'json', 'activity', 'alumni card'],
  },
  {
    id: 'account',
    title: 'Account Ownership and Control',
    shortTitle: 'Account control',
    icon: Trash2,
    description: 'Temporarily deactivate your account or permanently delete your alumnus profile.',
    keywords: ['delete', 'deactivate', 'remove', 'account', 'leave', 'danger zone'],
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  onNavigate,
  onOpenVerificationCenter,
  onBack,
}) => {
  const { currentUser, updateProfile, deleteAccount, logout } = useAuth();
  const { theme, setTheme, isDark } = useTheme();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('personal');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals & Inline Edit States
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
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

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // Privacy & Preferences State (synced to localStorage for persistence)
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

  const [isCardExporting, setIsCardExporting] = useState(false);

  // Trigger feedback toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SETTINGS_SECTIONS;
    const q = searchQuery.toLowerCase().trim();
    return SETTINGS_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(q) ||
        sec.shortTitle.toLowerCase().includes(q) ||
        sec.description.toLowerCase().includes(q) ||
        sec.keywords.some((kw) => kw.includes(q))
    );
  }, [searchQuery]);

  // Handle Personal Details Save
  const handleSavePersonal = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
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
    setIsEditingPersonal(false);
    showToast('Personal details updated successfully');
  };

  // Handle Password Change
  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);

    if (!newPassword || newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New passwords do not match. Please verify.');
      return;
    }

    // Mock/Simulated secure password update
    setPasswordChangeSuccess(true);
    showToast('Password updated securely');
    setTimeout(() => {
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChangeSuccess(false);
    }, 1200);
  };

  // Handle Directory Visibility Toggle
  const togglePublicDirectory = () => {
    const nextVal = !(currentUser.isPublic !== false);
    updateProfile({ isPublic: nextVal });
    showToast(`Directory visibility set to: ${nextVal ? 'Public' : 'Hidden'}`);
  };

  // Handle Contact Audience Change
  const updateContactAudience = (val: 'verified' | 'batch_only' | 'everyone' | 'private') => {
    setContactAudience(val);
    try {
      localStorage.setItem('szmc_settings_contact_audience', val);
    } catch {}
    showToast(`Contact visibility set to: ${val === 'verified' ? 'Verified Doctors Only' : val}`);
  };

  // Handle Notification Preference Toggle
  const toggleNotification = (key: keyof typeof notificationPreferences) => {
    setNotificationPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('szmc_settings_notifications', JSON.stringify(next));
      } catch {}
      return next;
    });
    showToast('Notification preference saved');
  };

  // Handle Blood Preference Toggle
  const toggleBloodDonorPreference = (key: keyof typeof bloodDonorPreferences) => {
    setBloodDonorPreferences((prev: any) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('szmc_settings_blood_donor', JSON.stringify(next));
      } catch {}
      return next;
    });
    showToast('Blood donor preference updated');
  };

  // Handle Digital ID Card Download
  const handleDownloadIdCard = () => {
    setIsCardExporting(true);
    setTimeout(() => {
      const cardData = {
        institution: 'Shaheed Ziaur Rahman Medical College (SZMC Bogura)',
        alumnusName: currentUser.fullName,
        batch: `MBBS Batch ${currentUser.batchYear}`,
        session: currentUser.session || 'SZMC Alumni',
        roll: currentUser.collegeRoll || 'N/A',
        degree: (currentUser.degree || ['MBBS']).join(', '),
        specialty: (currentUser.specialty || ['General Medicine']).join(', '),
        status: currentUser.verificationStatus === 'verified' ? 'VERIFIED ALUMNUS' : 'PENDING VOUCH',
        issuedAt: new Date().toLocaleDateString('en-GB'),
        portalUrl: 'https://szmcalumni.net/',
      };

      const blob = new Blob([JSON.stringify(cardData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SZMC_Alumni_Card_${currentUser.fullName.replace(/\s+/g, '_')}_Batch${currentUser.batchYear}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsCardExporting(false);
      showToast('Alumni Digital Record Card downloaded');
    }, 600);
  };

  // Handle Export Full Profile Data
  const handleExportFullData = () => {
    const fullData = {
      profile: currentUser,
      exportedAt: new Date().toISOString(),
      network: 'SZMC Alumni Portal',
      version: '2.5.0',
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `szmc_profile_archive_${currentUser.id}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Personal data archive exported successfully');
  };

  // Handle Permanent Delete
  const handleDeleteProfile = async () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type "DELETE" in capital letters to confirm.');
      return;
    }
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteAccount(deletePasswordConfirm);
      setIsDeleteModalOpen(false);
      onNavigate('feed');
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const isVerified = (currentUser.verificationStatus || 'verified') === 'verified';
  const currentDonor = getDonorProfileByUserId(currentUser.id);

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-slate-950/70 pb-20 pt-2 sm:pt-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-3 sm:px-6">
        {/* Top Facebook-Style Banner / Breadcrumb */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Profile</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              <span>Settings &amp; Privacy</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <span>Settings</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage your personal details, privacy controls, password &amp; security, and directory preferences.
            </p>
          </div>

          {/* Quick Profile View Button */}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <User className="w-4 h-4 text-slate-500" />
            <span>View Public Profile</span>
          </button>
        </div>

        {/* Facebook-Style Main Layout: Left Navigation + Right Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Accounts Center Card + Section Navigation */}
          <div className="lg:col-span-4 space-y-4">
            {/* Facebook Meta-style Accounts Center Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.fullName}
                    className="w-13 h-13 rounded-full object-cover ring-2 ring-blue-500/20"
                  />
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 ring-2 ring-white dark:ring-slate-900 rounded-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <span>SZMC Alumni Account</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {currentUser.fullName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Batch {currentUser.batchYear} · {currentUser.session || 'MBBS'}
                  </div>
                </div>
              </div>

              {/* Status Pills */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Verification</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                    isVerified
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{isVerified ? 'Verified Doctor' : 'Pending Vouch'}</span>
                </span>
              </div>
            </div>

            {/* Search Settings Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Navigation List of Setting Categories */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-2 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-0.5">
              {filteredSections.map((sec) => {
                const IconComponent = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(sec.id);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer group ${
                      isActive
                        ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-600/30'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs truncate">{sec.shortTitle}</div>
                        <div
                          className={`text-[10px] truncate max-w-[170px] ${
                            isActive ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {sec.keywords.slice(0, 3).join(', ')}
                        </div>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:translate-x-0.5'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Setting Content Panes */}
          <div className="lg:col-span-8 space-y-5">
            {/* SECTION 1: Personal Details */}
            {activeSection === 'personal' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span>Personal Details</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        SZMC institutional profile data and professional credentials.
                      </p>
                    </div>

                    {!isEditingPersonal && (
                      <button
                        type="button"
                        onClick={() => setIsEditingPersonal(true)}
                        className="px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        Edit Details
                      </button>
                    )}
                  </div>

                  {isEditingPersonal ? (
                    <form onSubmit={handleSavePersonal} className="space-y-4 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Current Designation / Position
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Assistant Professor, Medical Officer, Registrar"
                            value={editPosition}
                            onChange={(e) => setEditPosition(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Hospital / Institution
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Shaheed Ziaur Rahman Medical College Hospital"
                            value={editInstitution}
                            onChange={(e) => setEditInstitution(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Primary Profession / Specialty
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Physician, Surgeon, Cardiologist"
                            value={editProfession}
                            onChange={(e) => setEditProfession(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Mobile Phone (Login &amp; Emergency)
                          </label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="e.g. +8801700000000"
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            WhatsApp Number
                          </label>
                          <input
                            type="text"
                            value={editWhatsapp}
                            onChange={(e) => setEditWhatsapp(e.target.value)}
                            placeholder="e.g. +8801700000000"
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Current City
                          </label>
                          <input
                            type="text"
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="e.g. Bogura, Dhaka, Rajshahi"
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Country
                          </label>
                          <input
                            type="text"
                            value={editCountry}
                            onChange={(e) => setEditCountry(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Short Bio / About Me
                        </label>
                        <textarea
                          rows={3}
                          value={editBio}
                          onChange={(e) => setEditBio(e.target.value)}
                          placeholder="Brief introduction of your career milestones, clinical interests, or research."
                          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingPersonal(false)}
                          className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Name</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.fullName}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Batch &amp; Session</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          Batch {currentUser.batchYear} · {currentUser.session || 'MBBS'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">College Roll / BMDC</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.collegeRoll || 'Not listed'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Designation</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.position || currentUser.profession || 'Physician'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Institution</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.institution || 'Shaheed Ziaur Rahman Medical College Hospital'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Email</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.email || 'Not listed'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Phone</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.phone || 'Not listed'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Blood Group</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 text-right">
                          {currentUser.bloodGroup || currentDonor?.bloodGroup || 'Not specified'}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Location</span>
                        <span className="font-bold text-slate-900 dark:text-white text-right">
                          {currentUser.city || 'Bogura'}, {currentUser.country || 'Bangladesh'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 2: Password & Security */}
            {activeSection === 'security' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Password and Security</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Keep your SZMC alumni credentials safe with strong authentication and active session monitoring.
                    </p>
                  </div>

                  {/* Change Password Card */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <Key className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white">
                            Change Password
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            It's a good idea to use a strong password that you don't use elsewhere
                          </div>
                        </div>
                      </div>

                      {!isChangingPassword && (
                        <button
                          type="button"
                          onClick={() => setIsChangingPassword(true)}
                          className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          Change
                        </button>
                      )}
                    </div>

                    {isChangingPassword && (
                      <form onSubmit={handleSavePassword} className="space-y-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                        {passwordChangeError && (
                          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 font-semibold">
                            {passwordChangeError}
                          </div>
                        )}

                        {passwordChangeSuccess && (
                          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Password changed successfully!</span>
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Current Password
                          </label>
                          <div className="relative">
                            <input
                              type={showCurrentPassword ? 'text' : 'password'}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="Enter current password"
                              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                              New Password
                            </label>
                            <div className="relative">
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Min 6 characters"
                                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Retype New Password
                            </label>
                            <input
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Repeat new password"
                              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsChangingPassword(false)}
                            className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                          >
                            Save Password
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* Two-Factor Authentication Status */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>Two-Factor Authentication (2FA)</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Active
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          We will ask for a verification code if we notice a login from an unrecognized device
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => showToast('2FA settings are verified via your registered mobile number')}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    >
                      Manage
                    </button>
                  </div>

                  {/* Active Login Sessions */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Where You're Logged In
                      </div>
                      <button
                        type="button"
                        onClick={() => showToast('Other active sessions terminated')}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Log Out All Other Devices
                      </button>
                    </div>

                    <div className="divide-y divide-slate-200/60 dark:divide-slate-700/50 text-xs">
                      <div className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              Current Device (Web Portal)
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Bogura, Bangladesh · Active Now
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          This Session
                        </span>
                      </div>

                      <div className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              SZMC Android PWA
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Dhaka, Bangladesh · 2 days ago
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">
                          Recognized
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: Privacy & Directory Visibility */}
            {activeSection === 'privacy' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Privacy and Directory Visibility</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Control who can find your profile in searches and who can view your medical contact info.
                    </p>
                  </div>

                  {/* Public Directory Visibility Toggle */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Public Directory Visibility
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Allow other doctors, classmates, and visitors to find you on the universal alumni search and interactive map.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={togglePublicDirectory}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                        currentUser.isPublic !== false ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                      aria-label="Toggle directory visibility"
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                          currentUser.isPublic !== false ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Who can see your phone and email? */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Who can see your phone &amp; email?
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Choose your contact audience to protect against spam while staying reachable by colleagues.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {[
                        { id: 'verified', label: 'Verified Doctors Only', sub: 'Recommended for SZMC network' },
                        { id: 'batch_only', label: 'Only My Batchmates', sub: `Exclusive to Batch ${currentUser.batchYear}` },
                        { id: 'everyone', label: 'All Registered Alumni', sub: 'Any logged-in doctor' },
                        { id: 'private', label: 'Private (Hidden)', sub: 'Nobody except administrators' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateContactAudience(opt.id as any)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            contactAudience === opt.id
                              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500/80 dark:border-blue-400/80 ring-1 ring-blue-500/20'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {opt.label}
                            </span>
                            {contactAudience === opt.id && (
                              <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {opt.sub}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Workplace and Institution Location Visibility */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Hospital &amp; Practice Location on Map
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Pin your current clinical institution ({currentUser.institution || 'SZMCH'}) on the interactive Alumni Map.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = institutionVisibility === 'public' ? 'verified_only' : 'public';
                        setInstitutionVisibility(next);
                        try {
                          localStorage.setItem('szmc_settings_inst_visibility', next);
                        } catch {}
                        showToast(`Hospital map pin set to: ${next === 'public' ? 'Public' : 'Verified Alumni Only'}`);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                        institutionVisibility === 'public'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {institutionVisibility === 'public' ? 'Map Visible' : 'Restricted'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: Blood Network Donor Settings */}
            {activeSection === 'blood' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      <span>Emergency Blood Network Preferences</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Configure your readiness for urgent transfusion calls across Bogura, Rajshahi, and Dhaka medical corridors.
                    </p>
                  </div>

                  {/* Registered Donor Status */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                        <Heart className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Emergency Donor Registration</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-500/20 text-rose-600 dark:text-rose-300">
                            {currentUser.bloodGroup || 'Blood Donor'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {bloodDonorPreferences.isAvailable
                            ? 'You are active and discoverable for urgent patient needs'
                            : 'Temporarily on pause'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleBloodDonorPreference('isAvailable')}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                        bloodDonorPreferences.isAvailable ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                      aria-label="Toggle donor availability"
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                          bloodDonorPreferences.isAvailable ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Specific Emergency Capabilities */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Platelets Apheresis Donor
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Available for Dengue &amp; Oncology emergencies
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBloodDonorPreference('plateletsWilling')}
                        className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                          bloodDonorPreferences.plateletsWilling ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            bloodDonorPreferences.plateletsWilling ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Direct Phone Contact
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Allow blood coordinators to call your phone directly
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBloodDonorPreference('allowDirectPhoneCalls')}
                        className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                          bloodDonorPreferences.allowDirectPhoneCalls ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            bloodDonorPreferences.allowDirectPhoneCalls ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Need to update your last donation date or hospital address?
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('emergency')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      Open Blood Network →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: Notifications & Alerts */}
            {activeSection === 'notifications' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Notifications and Alerts</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Choose what notices, alerts, and peer messages you want to receive.
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Batch Announcements &amp; Official Notices
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Reunions, institutional circulars from Principal &amp; Alumni Council
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotification('batchAnnouncements')}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          notificationPreferences.batchAnnouncements ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationPreferences.batchAnnouncements ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Urgent Blood Emergency Alerts
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          High-priority blood calls matching your blood group in your city
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotification('bloodEmergencyCalls')}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          notificationPreferences.bloodEmergencyCalls ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationPreferences.bloodEmergencyCalls ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Peer Vouch Notifications
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          When classmates request you to vouch for their alumni status or vouch for you
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotification('peerVouches')}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          notificationPreferences.peerVouches ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationPreferences.peerVouches ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Post Comments &amp; Quad Interactions
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          When fellow doctors like, comment, or reply on your feed posts
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotification('postComments')}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          notificationPreferences.postComments ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationPreferences.postComments ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          Sound &amp; Audio Tone
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Play soft notification chimes for incoming messages and alerts
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotification('soundEnabled')}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          notificationPreferences.soundEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationPreferences.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 6: Alumni Verification & Badges */}
            {activeSection === 'verification' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <BadgeCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Alumni Verification &amp; Identity Badges</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Verify your Shaheed Ziaur Rahman Medical College identity to access all exclusive fraternity tools.
                    </p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Verification Status</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            {isVerified ? 'Verified SZMC Doctor' : 'Pending Peer Review'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Method: {currentUser.verificationMethod === 'admin' ? 'Super Administrator Review' : 'Peer Classmate Vouches (2/2)'}
                        </div>
                      </div>
                    </div>

                    {onOpenVerificationCenter && (
                      <button
                        type="button"
                        onClick={() => onOpenVerificationCenter('status')}
                        className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                      >
                        Verification Hub
                      </button>
                    )}
                  </div>

                  {/* Active Badges */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Your Identity Badges
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(currentUser.badges || ['Verified SZMCian']).map((b) => (
                        <span
                          key={b}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                          <span>{b}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Vouch Link */}
                  <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Vouch for Classmates
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Help verify doctors from Batch {currentUser.batchYear} by reviewing pending identity vouches.
                      </div>
                    </div>

                    {onOpenVerificationCenter && (
                      <button
                        type="button"
                        onClick={() => onOpenVerificationCenter('vouch_classmates')}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                      >
                        Review Vouches
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 7: Theme, Language & Appearance */}
            {activeSection === 'appearance' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Theme, Language &amp; Display</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Tailor the visual experience and interface language of the portal.
                    </p>
                  </div>

                  {/* Theme Switcher */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Display Theme
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'light', name: 'Clean Light', icon: Sun },
                        { id: 'dark', name: 'Deep Dark', icon: Moon },
                        { id: 'ndc-blue', name: 'SZMC Blue', icon: Sparkles },
                        { id: 'midnight', name: 'Midnight', icon: Moon },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTheme(t.id as any);
                            showToast(`Theme updated: ${t.name}`);
                          }}
                          className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                            theme === t.id
                              ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-md shadow-blue-600/25'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <t.icon className="w-5 h-5 mx-auto mb-1.5 opacity-90" />
                          <div className="text-xs">{t.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language Switcher */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Language / ভাষা
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setLanguagePreference('en');
                          try {
                            localStorage.setItem('szmc_settings_lang', 'en');
                          } catch {}
                          showToast('Language set to English (US)');
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          languagePreference === 'en'
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white">English (Default)</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Universal Medical English</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLanguagePreference('bn');
                          try {
                            localStorage.setItem('szmc_settings_lang', 'bn');
                          } catch {}
                          showToast('ভাষা বাংলা হিসেবে সংরক্ষিত হয়েছে');
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          languagePreference === 'bn'
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 font-bold'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white">বাংলা (Bengali)</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">শহীদ জিয়াউর রহমান মেডিকেল কলেজ</div>
                      </button>
                    </div>
                  </div>

                  {/* Institutional Splash & Loading Screen Preview */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-900 dark:text-white mb-1">
                      Institutional Loading Screen
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                      Replay the cinematic loading screen with the authentic SZMC emblem, Google glowing border, and motto.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined' && (window as any).szmcReplaySplash) {
                          (window as any).szmcReplaySplash();
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Preview Loading Page
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 8: Your Data & Card Download */}
            {activeSection === 'data' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span>Your Information &amp; Data Download</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Download your official SZMC Digital Alumni ID Card or export your verified profile archive.
                    </p>
                  </div>

                  {/* Digital Alumni ID Card Preview & Download */}
                  <div className="p-5 rounded-3xl bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-white/5 rounded-full blur-xl pointer-events-none" />

                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md p-1 border border-white/20 flex items-center justify-center shrink-0">
                          <NDCLogo className="w-full h-full" />
                        </div>
                        <div>
                          <div className="text-[10px] font-black tracking-widest uppercase text-blue-200">
                            OFFICIAL DIGITAL ALUMNI CARD
                          </div>
                          <div className="text-base font-black tracking-tight">{currentUser.fullName}</div>
                          <div className="text-xs text-blue-100">
                            Batch {currentUser.batchYear} · {currentUser.session || 'MBBS'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isCardExporting}
                        onClick={handleDownloadIdCard}
                        className="px-4 py-2.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer self-start sm:self-auto shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        <span>{isCardExporting ? 'Generating Card...' : 'Download Card'}</span>
                      </button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between text-[11px] text-blue-200 gap-2">
                      <div>Shaheed Ziaur Rahman Medical College Hospital, Bogura</div>
                      <div className="font-mono text-white font-bold">
                        SZMC-{currentUser.batchYear}-{currentUser.id}
                      </div>
                    </div>
                  </div>

                  {/* Export Profile Archive */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Export Personal Profile Archive (JSON)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Download a machine-readable copy of your full records, vouches, and blood donor details.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportFullData}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Data</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 9: Account Ownership & Control */}
            {activeSection === 'account' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <span>Account Ownership and Control</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Manage your account deactivation or permanently delete your alumnus profile and associated data.
                    </p>
                  </div>

                  {/* Temporary Deactivation */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Deactivate Account Temporarily
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Your profile, posts, and donor availability will be hidden until you log back in.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        updateProfile({ isPublic: false });
                        logout();
                        onNavigate('feed');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    >
                      Deactivate
                    </button>
                  </div>

                  {/* Danger Zone: Permanent Deletion */}
                  <div className="p-5 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/60 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800/60 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-red-700 dark:text-red-400 tracking-tight">
                          Permanently Delete Profile
                        </h3>
                        <p className="text-xs text-red-600/90 dark:text-red-300/80 mt-0.5 leading-relaxed">
                          Deleting your account is permanent. All your profile information, emergency blood registry, batch connections, and directory listing will be wiped permanently.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteConfirmationText('');
                          setDeletePasswordConfirm('');
                          setIsDeleteModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md shadow-red-600/20 flex items-center gap-2 cursor-pointer transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete My Profile</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Permanently Delete Profile?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Are you sure you want to delete <strong className="text-slate-800 dark:text-slate-200">{currentUser.fullName}</strong>? This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300">
                {deleteError}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Type <span className="text-red-600 font-black">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password Confirmation (optional):
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={deletePasswordConfirm}
                  onChange={(e) => setDeletePasswordConfirm(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting || deleteConfirmationText.trim().toUpperCase() !== 'DELETE'}
                onClick={handleDeleteProfile}
                className={`px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-2 transition-all cursor-pointer ${
                  deleteConfirmationText.trim().toUpperCase() === 'DELETE' && !isDeleting
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25'
                    : 'bg-red-300 dark:bg-red-950 text-red-100 dark:text-red-400 cursor-not-allowed opacity-60'
                }`}
              >
                {isDeleting ? (
                  <span>Deleting Profile...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
