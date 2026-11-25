import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Shield,
  Users,
  Lock,
  Volume2,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
} from 'lucide-react';
import {
  getUserMessageSettings,
  updateUserMessageSettings,
} from '../../services/messagingService';
import {
  fetchBlockedUsersList,
  unblockUser,
  type BlockedUserEntry,
} from '../../services/communitySafetyService';
import type { UserMessageSettings } from '../../types/messaging';
import { playSound } from '../../utils/audio';

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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const loadSettings = async () => {
    setIsLoading(true);
    setSaveError(null);
    try {
      const [currentSettings, blockedList] = await Promise.all([
        getUserMessageSettings(profileId),
        fetchBlockedUsersList(profileId),
      ]);
      setSettings(currentSettings);
      setBlockedUsers(blockedList);
    } catch (err) {
      console.warn('Failed to load message settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnblock = async (blockedId: number) => {
    setUnblockingId(blockedId);
    try {
      await unblockUser(profileId, blockedId);
      setBlockedUsers((prev) => prev.filter((entry) => entry.blockedId !== blockedId));
    } finally {
      setUnblockingId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadSettings();
    }
  }, [isOpen, profileId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

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
      }, 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Could not save your settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-settings-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="message-settings-modal-title"
                className="text-lg font-bold text-slate-900 dark:text-white truncate"
              >
                Chat &amp; Message Settings
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                Choose who can message you and manage blocked people
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
              <p className="text-sm text-slate-500">Loading your chat settings...</p>
            </div>
          ) : (
            <>
              {/* 1. WHO CAN MESSAGE YOU */}
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  1. Who can send you messages?
                </h3>
                <div className="space-y-2.5" role="radiogroup" aria-label="Who can send you messages">
                  {[
                    {
                      id: 'everyone',
                      label: 'Everyone on SZMC',
                      desc: 'Any member or student can send you a message.',
                      icon: Users,
                    },
                    {
                      id: 'verified_only',
                      label: 'Verified Doctors Only',
                      desc: 'Only verified SZMC alumni can message you.',
                      icon: Shield,
                    },
                    {
                      id: 'batch_only',
                      label: batchYear ? `Only Batch ${batchYear}` : 'Only My Batchmates',
                      desc: 'Only classmates from your own batch can start a chat.',
                      icon: Lock,
                    },
                  ].map((opt) => {
                    const isSelected = settings.whoCanMessage === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleToggle('whoCanMessage', opt.id)}
                        className={`w-full min-h-[68px] text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3.5 active:scale-[0.99] ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-bold text-slate-900 dark:text-white">
                            {opt.label}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                            {opt.desc}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. SIMPLE ON / OFF SWITCHES */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  2. Chat Comfort
                </h3>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    {
                      key: 'soundEnabled' as const,
                      title: 'Message Sound',
                      desc: 'Play a gentle chime when a new message arrives.',
                      showTest: true,
                    },
                    {
                      key: 'readReceiptsEnabled' as const,
                      title: 'Show "Seen" Checkmarks',
                      desc: 'Let colleagues know when you have read their message.',
                      showTest: false,
                    },
                    {
                      key: 'notificationPreviewEnabled' as const,
                      title: 'Show Message Preview',
                      desc: 'Show the sender name and short message in alerts.',
                      showTest: false,
                    },
                  ].map((item) => {
                    const checked = Boolean(settings[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base font-semibold text-slate-900 dark:text-white">
                              {item.title}
                            </span>
                            {item.showTest && (
                              <button
                                type="button"
                                onClick={() => playSound('notification')}
                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>Test</span>
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                            {item.desc}
                          </p>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          onClick={() => handleToggle(item.key, !checked)}
                          className="flex items-center gap-2 shrink-0 cursor-pointer"
                        >
                          <span
                            className={`text-xs font-bold w-7 text-right ${
                              checked ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                            }`}
                          >
                            {checked ? 'ON' : 'OFF'}
                          </span>
                          <span
                            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-150 ${
                              checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                                checked ? 'translate-x-7' : 'translate-x-1'
                              }`}
                            />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. BLOCKED PEOPLE */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-500" />
                  <span>Blocked People ({blockedUsers.length})</span>
                </h3>

                {blockedUsers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    You have not blocked anyone.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {blockedUsers.map((entry) => (
                      <div
                        key={entry.blockedId}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={entry.avatarUrl}
                            alt={entry.fullName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {entry.fullName}
                            </p>
                            {entry.batchYear && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Batch {entry.batchYear}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleUnblock(entry.blockedId)}
                          disabled={unblockingId === entry.blockedId}
                          className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {unblockingId === entry.blockedId ? 'Unblocking...' : 'Unblock'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {saveSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm font-semibold flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Saved! Your chat settings are updated.</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm font-semibold flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-safe sm:py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="min-h-[46px] inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all disabled:opacity-60 cursor-pointer active:scale-95"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
