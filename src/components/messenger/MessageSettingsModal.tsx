import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Shield,
  Users,
  Lock,
  Volume2,
  VolumeX,
  Eye,
  Mail,
  Check,
  Loader2,
  Database,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  getUserMessageSettings,
  updateUserMessageSettings,
  getMessagingConnectionStatus,
} from '../../services/messagingService';
import type { UserMessageSettings } from '../../types/messaging';
import { playSound } from '../../utils/audio';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../types';

interface MessageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: number;
  batchYear?: number;
}

export const MessageSettingsModal: React.FC<MessageSettingsModalProps> = ({
  isOpen,
  onClose,
  profileId,
  batchYear,
}) => {
  const { currentUser, isAdminUser } = useAuth();
  const isSuperAdmin = currentUser.role === 'admin' || isAdminUser;

  const [settings, setSettings] = useState<UserMessageSettings>({
    profileId,
    whoCanMessage: 'everyone',
    readReceiptsEnabled: true,
    soundEnabled: true,
    notificationPreviewEnabled: true,
    emailNotificationDigest: false,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    supabaseUrl: string;
    tablesOnline: boolean;
    storageFallbackActive: boolean;
    realtimeEnabled: boolean;
  }>({
    connected: true,
    supabaseUrl: 'https://hjuyiqyviohinbhzaipl.supabase.co',
    tablesOnline: false,
    storageFallbackActive: true,
    realtimeEnabled: false,
  });

  const [checkingDb, setCheckingDb] = useState(false);

  const loadStatusAndSettings = async () => {
    setIsLoading(true);
    setSaveError(null);
    try {
      const [currentSettings, status] = await Promise.all([
        getUserMessageSettings(profileId),
        getMessagingConnectionStatus(),
      ]);
      setSettings(currentSettings);
      setDbStatus(status);
    } catch (err: any) {
      console.warn('Failed to load message settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadStatusAndSettings();
    }
  }, [isOpen, profileId]);

  const handleRefreshStatus = async () => {
    setCheckingDb(true);
    try {
      const status = await getMessagingConnectionStatus();
      setDbStatus(status);
    } finally {
      setCheckingDb(false);
    }
  };

  const handleToggle = (key: keyof UserMessageSettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    setSaveSuccess(false);
    if (key === 'soundEnabled' && value === true) {
      playSound('notification');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await updateUserMessageSettings(profileId, settings);
      setSettings(updated);
      setSaveSuccess(true);
      if (settings.soundEnabled) {
        playSound('like');
      }
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to sync settings with Supabase');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Message & Privacy Settings
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  Supabase Live
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control incoming chats, privacy, read receipts, and alerts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Supabase connection status (probed directly against the database) */}
          <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Supabase Direct Connection
              </span>
              <button
                type="button"
                onClick={() => void handleRefreshStatus()}
                disabled={checkingDb}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${checkingDb ? 'animate-spin' : ''}`} />
                Recheck
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
              <span>Messaging tables</span>
              <span
                className={`font-bold ${
                  dbStatus.tablesOnline
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {dbStatus.tablesOnline ? 'Online' : 'Unavailable'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
              <span>Realtime channel</span>
              <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">
                messages-realtime-feed
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-500 dark:text-slate-500 truncate">
              {dbStatus.supabaseUrl}
            </p>
          </div>

          {/* Institutional Status Banner */}
          {isSuperAdmin && (
            <div className="p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-600" />
                Live Messaging & Privacy Preferences
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold">
                Online
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500">Loading your message preferences from Supabase...</p>
            </div>
          ) : (
            <>
              {/* SECTION 1: WHO CAN MESSAGE YOU */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Who can send you direct messages
                </label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'everyone',
                      label: 'Everyone on SZMC Network',
                      desc: 'Any registered alumnus, doctor, faculty member or medical student can send you a message.',
                      icon: Users,
                    },
                    {
                      id: 'verified_only',
                      label: 'Verified Doctors & Alumni Only',
                      desc: 'Only alumni who have completed institutional identity verification or peer vouches.',
                      icon: Shield,
                    },
                    {
                      id: 'batch_only',
                      label: batchYear ? `MBBS Batch ${batchYear} Only` : 'My MBBS Batchmates Only',
                      desc: 'Restrict incoming message requests strictly to colleagues from your medical batch.',
                      icon: Lock,
                    },
                  ].map((opt) => {
                    const isSelected = settings.whoCanMessage === opt.id;
                    const Icon = opt.icon;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleToggle('whoCanMessage', opt.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-500 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center justify-between">
                            <span>{opt.label}</span>
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                            >
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                            {opt.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: PRIVACY & CHAT FEATURES */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Chat Behavior & Privacy
                </label>

                <div className="space-y-2.5">
                  {/* Read Receipts */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Read Receipts</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Let fellow alumni see when you have read their messages with double checkmarks.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.readReceiptsEnabled}
                      onClick={() => handleToggle('readReceiptsEnabled', !settings.readReceiptsEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.readReceiptsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.readReceiptsEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Sound Chimes */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Message Sounds</p>
                        <button
                          type="button"
                          onClick={() => playSound('notification')}
                          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Volume2 className="w-3 h-3" /> Test
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Play subtle audio chimes when messages are sent or received.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.soundEnabled}
                      onClick={() => handleToggle('soundEnabled', !settings.soundEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.soundEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Notification Previews */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Message Preview in Alerts</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Show sender name and message excerpt in push and in-app banners.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.notificationPreviewEnabled}
                      onClick={() =>
                        handleToggle('notificationPreviewEnabled', !settings.notificationPreviewEnabled)
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.notificationPreviewEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.notificationPreviewEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Email Digest */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Email Digest for Unread Chats</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Receive email summaries of missed messages when you've been offline for over 6 hours.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.emailNotificationDigest}
                      onClick={() =>
                        handleToggle('emailNotificationDigest', !settings.emailNotificationDigest)
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.emailNotificationDigest ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          settings.emailNotificationDigest ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Feedback Toasts */}
          {saveSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Message settings saved and synced with Supabase successfully!</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {settings.updatedAt ? `Last saved: ${new Date(settings.updatedAt).toLocaleTimeString()}` : 'Ready to save'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving to Supabase...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Save Preferences
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
