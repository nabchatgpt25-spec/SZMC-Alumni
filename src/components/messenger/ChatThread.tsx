import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Info,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Phone,
  Video,
  Smile,
  ThumbsUp,
  Image as ImageIcon,
  Plus,
  ShieldCheck,
  Check,
  CheckCheck,
  Clock,
  RotateCcw,
  ChevronDown,
  Ban,
  Megaphone,
  Reply,
  X,
  Stethoscope,
  Droplet,
  BarChart2,
  PenTool,
  User,
  BellOff,
} from 'lucide-react';
import {
  createAnnotationSessionKey,
  subscribeToDmAnnotationSession,
  uploadChatImage,
  type ProfileCardShareInput,
} from '../../services/messagingService';
import type {
  ChatConversation,
  ChatMessage,
  ChatPerson,
  MessageReaction,
} from '../../types/messaging';
import type { ActiveDmAnnotationSession, AnnotationTarget } from '../../types/annotation';
import { playSound } from '../../utils/audio';
import {
  CLINICAL_STATUS_META,
  isQuietRecommendedStatus,
  type ClinicalStatusKey,
} from '../../utils/clinicalStatus';
import {
  POLL_OPTION_EMOJIS,
  buildConsultMessageText,
  buildLifelineMessageText,
  buildPollMessageText,
  buildProfileShareCardMessageText,
  formatStructuredPreview,
  parseStructuredChatMessage,
} from '../../utils/structuredChat';
import { ClinicalStatusChip } from '../ClinicalStatusChip';
import { HuddleModal, extractHuddleRoomFromText } from './HuddleModal';
import { SharedImageAnnotatorModal } from './SharedImageAnnotatorModal';
import { RichMessageText, StructuredChatCard } from './StructuredChatCard';

interface SendOptions {
  type?: 'text' | 'like' | 'image' | 'system' | 'ProfileShareCard';
  mediaUrl?: string | null;
  replyToMessageId?: string | null;
  isSilent?: boolean;
}

interface ChatThreadProps {
  conversation: ChatConversation;
  messages: ChatMessage[];
  myId: number;
  myDisplayName?: string;
  myAvatarUrl?: string;
  isSuperAdmin?: boolean;
  readReceiptsEnabled?: boolean;
  participants?: ChatPerson[];
  reactionsByMessageId?: Record<string, MessageReaction[]>;
  loading: boolean;
  hasMoreMessages?: boolean;
  loadingOlder?: boolean;
  error: string | null;
  sending: boolean;
  typingText?: string | null;
  isPeerOnline?: boolean;
  peerClinicalStatus?: ClinicalStatusKey | null;
  onTyping?: () => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onLoadOlder?: () => Promise<void>;
  onSend: (body: string, options?: SendOptions) => Promise<boolean>;
  onRetrySend?: (message: ChatMessage) => void;
  onDismissFailed?: (tempId: string) => void;
  onEdit: (messageId: string, body: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onViewProfile?: (profileId: number) => void;
  currentProfile?: ProfileCardShareInput;
}

const REACTION_EMOJIS = ['🩺', '❤️', '👍', '😂', '🙏', '👏', '🔥'];
const COMPOSER_EMOJIS = ['❤️', '😂', '🔥', '👏', '🙏', '🩺', '🎉', '💯'];

function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatLastSeen(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 2) return 'Last seen just now';
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Last seen ${diffHr}h ago`;
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  messages,
  myId,
  myDisplayName = 'SZMC Doctor',
  myAvatarUrl = '/szmc-logo.png',
  isSuperAdmin = false,
  readReceiptsEnabled = true,
  participants = [],
  reactionsByMessageId = {},
  loading,
  hasMoreMessages = false,
  loadingOlder = false,
  error,
  sending,
  typingText,
  isPeerOnline = false,
  peerClinicalStatus = null,
  onTyping,
  onBack,
  onOpenSettings,
  onLoadOlder,
  onSend,
  onRetrySend,
  onDismissFailed,
  onEdit,
  onDelete,
  onToggleReaction,
  onViewProfile,
  currentProfile,
}) => {
  const [draft, setDraft] = useState('');
  const [sendQuietly, setSendQuietly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeActionMessageId, setActiveActionMessageId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [huddleMode, setHuddleMode] = useState<'audio' | 'video' | null>(null);
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);
  const [liveDmSession, setLiveDmSession] = useState<ActiveDmAnnotationSession | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hasUnseenBelow, setHasUnseenBelow] = useState(false);

  // Interactive SZMC Alumni Tools (+ Drawer)
  const [composerTool, setComposerTool] = useState<null | 'menu' | 'consult' | 'lifeline' | 'poll'>(null);
  const [consultSpecialty, setConsultSpecialty] = useState('Internal Medicine');
  const [consultUrgency, setConsultUrgency] = useState<'Routine' | 'Urgent'>('Routine');
  const [consultSummary, setConsultSummary] = useState('');
  const [consultQuestion, setConsultQuestion] = useState('');
  const [lifelineGroup, setLifelineGroup] = useState('O+');
  const [lifelineHospital, setLifelineHospital] = useState('');
  const [lifelineNote, setLifelineNote] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanAnnotateInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const prevLastMsgIdRef = useRef<string | null>(null);
  const pendingScrollRestoreHeightRef = useRef<number | null>(null);

  const participantById = useMemo(() => {
    const map = new Map<number, ChatPerson>();
    participants.forEach((p) => map.set(p.profileId, p));
    return map;
  }, [participants]);

  const messageById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const clearPendingImage = () => {
    if (pendingImagePreviewUrl) {
      URL.revokeObjectURL(pendingImagePreviewUrl);
    }
    setPendingImageFile(null);
    setPendingImagePreviewUrl(null);
    setUploadError(null);
  };

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) {
        URL.revokeObjectURL(pendingImagePreviewUrl);
      }
    };
  }, [pendingImagePreviewUrl]);

  useEffect(() => {
    setDraft('');
    setSendQuietly(false);
    setEditingId(null);
    setConfirmDeleteId(null);
    setActiveActionMessageId(null);
    setReactionPickerMsgId(null);
    setReplyingTo(null);
    setHasUnseenBelow(false);
    setUploadError(null);
    setShowEmojiPicker(false);
    setComposerTool(null);
    setAnnotationTarget(null);
    setLiveDmSession(null);
    if (pendingImagePreviewUrl) {
      URL.revokeObjectURL(pendingImagePreviewUrl);
    }
    setPendingImageFile(null);
    setPendingImagePreviewUrl(null);
    isNearBottomRef.current = true;
    prevLastMsgIdRef.current = null;
    pendingScrollRestoreHeightRef.current = null;
  }, [conversation.id]);

  // Listen for live shared-canvas annotation invites from the DM counterpart
  const canAnnotateDm =
    conversation.type !== 'group' &&
    conversation.type !== 'announcement' &&
    !conversation.isBlockedEitherWay;

  useEffect(() => {
    if (!canAnnotateDm) {
      setLiveDmSession(null);
      return;
    }
    const unsub = subscribeToDmAnnotationSession(conversation.id, (session) => {
      if (session.hostProfileId === myId) return;
      if (!session.active) {
        setLiveDmSession((prev) => (prev && prev.sessionKey === session.sessionKey ? null : prev));
        return;
      }
      setLiveDmSession(session);
    });
    return () => unsub();
  }, [conversation.id, canAnnotateDm, myId]);

  // ESC closes open lightbox or reaction/action popovers
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);

  // Smart auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pendingScrollRestoreHeightRef.current !== null) {
      const prevHeight = pendingScrollRestoreHeightRef.current;
      pendingScrollRestoreHeightRef.current = null;
      const delta = el.scrollHeight - prevHeight;
      if (delta > 0) {
        el.scrollTop = delta;
      }
      return;
    }

    const latest = messages[messages.length - 1];
    const latestId = latest?.id ?? null;
    const isInitialLoad = prevLastMsgIdRef.current === null && messages.length > 0;
    const appendedNewMessage = latestId !== null && latestId !== prevLastMsgIdRef.current;
    const sentByMe = latest?.senderId === myId;
    prevLastMsgIdRef.current = latestId;

    if (isInitialLoad || sentByMe || isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setHasUnseenBelow(false);
    } else if (appendedNewMessage) {
      setHasUnseenBelow(true);
    }
  }, [messages, conversation.id, typingText, myId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 140;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setHasUnseenBelow(false);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    isNearBottomRef.current = true;
    setHasUnseenBelow(false);
  };

  const scrollToMessage = (targetId: string) => {
    const node = scrollRef.current?.querySelector(`[data-message-id="${targetId}"]`) as HTMLElement | null;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(targetId);
    setTimeout(() => {
      setHighlightedMessageId((curr) => (curr === targetId ? null : curr));
    }, 1800);
  };

  const handleLoadOlderClick = async () => {
    if (!onLoadOlder || loadingOlder) return;
    const el = scrollRef.current;
    if (el) {
      pendingScrollRestoreHeightRef.current = el.scrollHeight;
    }
    await onLoadOlder();
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      setUploadError('Please choose a valid image file (JPG, PNG, WebP, or GIF).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image must be smaller than 8 MB.');
      return;
    }

    if (pendingImagePreviewUrl) {
      URL.revokeObjectURL(pendingImagePreviewUrl);
    }
    setUploadError(null);
    setPendingImageFile(file);
    setPendingImagePreviewUrl(URL.createObjectURL(file));
    composerRef.current?.focus();
  };

  const openAnnotatorForImage = (imageUrl: string, sourceMessageId?: string | null, title?: string) => {
    if (!canAnnotateDm || !imageUrl) return;
    setLightboxUrl(null);
    setAnnotationTarget({
      sessionKey: createAnnotationSessionKey(sourceMessageId, imageUrl),
      imageUrl,
      sourceMessageId: sourceMessageId ?? null,
      title,
    });
  };

  const handleAnnotatePendingImage = async () => {
    if (!pendingImageFile || !canAnnotateDm || uploadingImage || sending) return;
    const fileToUpload = pendingImageFile;
    setUploadingImage(true);
    setUploadError(null);
    try {
      const mediaUrl = await uploadChatImage(fileToUpload, conversation.id);
      clearPendingImage();
      const ok = await onSend('📷 Clinical scan shared for live annotation', {
        type: 'image',
        mediaUrl,
        replyToMessageId: replyingTo?.id ?? null,
        isSilent: sendQuietly,
      });
      setReplyingTo(null);
      if (ok) {
        openAnnotatorForImage(mediaUrl, null, fileToUpload.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Scan upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePickScanToAnnotate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !canAnnotateDm) return;
    if (!file.type || !file.type.startsWith('image/')) {
      setUploadError('Please choose a valid image file (JPG, PNG, WebP, or GIF).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image must be smaller than 8 MB.');
      return;
    }
    setComposerTool(null);
    setUploadingImage(true);
    setUploadError(null);
    try {
      const mediaUrl = await uploadChatImage(file, conversation.id);
      await onSend('📷 Clinical scan shared for live annotation', {
        type: 'image',
        mediaUrl,
        isSilent: sendQuietly,
      });
      openAnnotatorForImage(mediaUrl, null, file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Scan upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && !pendingImageFile) || sending || uploadingImage) return;

    const replyId = replyingTo?.id ?? null;
    const fileToUpload = pendingImageFile;

    if (fileToUpload) {
      setUploadingImage(true);
      setUploadError(null);
      try {
        const mediaUrl = await uploadChatImage(fileToUpload, conversation.id);
        setDraft('');
        setReplyingTo(null);
        clearPendingImage();
        const ok = await onSend(body, {
          type: 'image',
          mediaUrl,
          replyToMessageId: replyId,
          isSilent: sendQuietly,
        });
        if (ok && !sendQuietly) {
          playSound('pop');
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Photo upload failed. Please try again.');
      } finally {
        setUploadingImage(false);
      }
      return;
    }

    setDraft('');
    setReplyingTo(null);
    const ok = await onSend(body, {
      type: body === '👍' ? 'like' : 'text',
      replyToMessageId: replyId,
      isSilent: sendQuietly,
    });
    if (ok && !sendQuietly) {
      playSound('pop');
    }
  };

  const sendThumbsUp = async () => {
    if (sending || uploadingImage) return;
    await onSend('👍', { type: 'like', replyToMessageId: replyingTo?.id ?? null, isSilent: sendQuietly });
    setReplyingTo(null);
    if (!sendQuietly) playSound('like');
  };

  const handleAddEmoji = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    setShowEmojiPicker(false);
    onTyping?.();
    composerRef.current?.focus();
  };

  const handleSendConsultCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultSummary.trim() || sending || uploadingImage) return;
    const body = buildConsultMessageText({
      specialty: consultSpecialty,
      urgency: consultUrgency,
      summary: consultSummary,
      question: consultQuestion,
    });
    const ok = await onSend(body, {
      type: 'text',
      replyToMessageId: replyingTo?.id ?? null,
      isSilent: sendQuietly,
    });
    if (ok) {
      setConsultSummary('');
      setConsultQuestion('');
      setReplyingTo(null);
      setComposerTool(null);
      if (!sendQuietly) playSound('pop');
    }
  };

  const handleSendLifelineCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lifelineHospital.trim() || sending || uploadingImage) return;
    const body = buildLifelineMessageText({
      bloodGroup: lifelineGroup,
      hospital: lifelineHospital,
      note: lifelineNote,
    });
    const ok = await onSend(body, {
      type: 'text',
      replyToMessageId: replyingTo?.id ?? null,
      isSilent: sendQuietly,
    });
    if (ok) {
      setLifelineHospital('');
      setLifelineNote('');
      setReplyingTo(null);
      setComposerTool(null);
      if (!sendQuietly) playSound('pop');
    }
  };

  const handleSendPollCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || validOpts.length < 2 || sending || uploadingImage) return;
    const body = buildPollMessageText({
      question: pollQuestion,
      options: validOpts,
    });
    const ok = await onSend(body, {
      type: 'text',
      replyToMessageId: replyingTo?.id ?? null,
      isSilent: sendQuietly,
    });
    if (ok) {
      setPollQuestion('');
      setPollOptions(['', '']);
      setReplyingTo(null);
      setComposerTool(null);
      if (!sendQuietly) playSound('pop');
    }
  };

  const handleSendMyProfileCard = async () => {
    if (!currentProfile || sending || uploadingImage) return;
    const specialtyText =
      currentProfile.specialty && currentProfile.specialty.length > 0
        ? currentProfile.specialty.slice(0, 3).join(' · ')
        : currentProfile.position || currentProfile.profession || 'SZMC Physician';
    const profileUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}?card=${currentProfile.id}`
        : `?card=${currentProfile.id}`;
    const body = buildProfileShareCardMessageText({
      profileId: currentProfile.id,
      fullName: currentProfile.fullName,
      batchYear: currentProfile.batchYear || 20,
      specialty: specialtyText,
      institution: currentProfile.institution,
      avatarUrl: currentProfile.avatarUrl,
      profileUrl,
    });
    const ok = await onSend(body, {
      type: 'ProfileShareCard',
      replyToMessageId: replyingTo?.id ?? null,
      isSilent: sendQuietly,
    });
    if (ok) {
      setReplyingTo(null);
      setComposerTool(null);
      playSound('pop');
    }
  };

  const saveEdit = async () => {
    const body = editDraft.trim();
    if (!editingId || !body) return;
    setSavingEdit(true);
    const ok = await onEdit(editingId, body);
    setSavingEdit(false);
    if (ok) {
      setEditingId(null);
      setActiveActionMessageId(null);
    }
  };

  const handleConfirmDelete = (messageId: string) => {
    setConfirmDeleteId(null);
    setActiveActionMessageId(null);
    void onDelete(messageId);
  };

  const getSenderLabel = (senderId: number): string => {
    if (senderId === myId) return 'You';
    return participantById.get(senderId)?.fullName || conversation.person.fullName || 'SZMC Colleague';
  };

  const { person } = conversation;
  const isGroup = conversation.type === 'group';
  const isAnnouncement = conversation.type === 'announcement';
  const callsDisabled = Boolean(conversation.isBlockedEitherWay || isAnnouncement);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden relative">
      {/* Meta Messenger Conversation Header */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative shrink-0">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover ring-1 ring-slate-200/80 dark:ring-slate-700"
            />
            {!isGroup &&
              !isAnnouncement &&
              (isPeerOnline || peerClinicalStatus) &&
              !conversation.isBlockedEitherWay && (
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    peerClinicalStatus
                      ? CLINICAL_STATUS_META[peerClinicalStatus].dotClass
                      : 'bg-emerald-500'
                  }`}
                  title={
                    peerClinicalStatus
                      ? CLINICAL_STATUS_META[peerClinicalStatus].label
                      : 'Active now'
                  }
                />
              )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {person.fullName}
              </h3>
              {(person.verificationStatus === 'verified' || isAnnouncement) && (
                <ShieldCheck className="w-4 h-4 text-[#0084FF] shrink-0" />
              )}
              {!isGroup && !isAnnouncement && !conversation.isBlockedEitherWay && peerClinicalStatus && (
                <ClinicalStatusChip status={peerClinicalStatus} size="xs" />
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              {isAnnouncement ? (
                <span>Official SZMC Alumni Broadcast Channel</span>
              ) : isGroup ? (
                <span>{participants.length || conversation.participantCount || 2} members</span>
              ) : (isPeerOnline || peerClinicalStatus) && !conversation.isBlockedEitherWay ? (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      peerClinicalStatus
                        ? CLINICAL_STATUS_META[peerClinicalStatus].dotClass
                        : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">Active now</span>
                </>
              ) : (
                <span>
                  {(!conversation.isBlockedEitherWay && formatLastSeen(person.lastSeenAt)) ||
                    `Batch ${person.batchYear || 'Alumnus'} · ${person.profession || 'Doctor'}`}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Header Actions (Voice Huddle, Video Huddle & Info) */}
        <div className="flex items-center gap-0.5 sm:gap-1 text-[#0084FF] shrink-0">
          {!callsDisabled && (
            <>
              <button
                type="button"
                onClick={() => setHuddleMode('audio')}
                title="Start Voice Huddle"
                aria-label="Start Voice Huddle"
                className="min-w-[40px] min-h-[40px] rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setHuddleMode('video')}
                title="Start Video Huddle"
                aria-label="Start Video Huddle"
                className="min-w-[40px] min-h-[40px] rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Conversation details"
            aria-label="Conversation details"
            className="min-w-[40px] min-h-[40px] rounded-full hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Shared Annotation Invite Banner (DM only) */}
      {liveDmSession && canAnnotateDm && (
        <div className="px-3.5 py-2 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
              {liveDmSession.hostName.split(' ')[0]} is annotating a clinical image live
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setAnnotationTarget({
                sessionKey: liveDmSession.sessionKey,
                imageUrl: liveDmSession.imageUrl,
                sourceMessageId: liveDmSession.sourceMessageId ?? null,
              })
            }
            className="px-3 py-1 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-[11px] font-bold whitespace-nowrap cursor-pointer shrink-0"
          >
            Join Live Canvas
          </button>
        </div>
      )}

      {/* Messages Canvas */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 bg-[#F0F2F5]/40 dark:bg-slate-950/40 relative"
      >
        {/* Cursor Pagination: Load older history */}
        {hasMoreMessages && !loading && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => void handleLoadOlderClick()}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:border-[#0084FF] hover:text-[#0084FF] shadow-2xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loadingOlder && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{loadingOlder ? 'Loading older messages...' : 'Load older messages'}</span>
            </button>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#0084FF]" />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div className="text-center py-14 flex flex-col items-center">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-[#0084FF]/20 shadow-md mb-3"
            />
            <h4 className="text-base font-bold text-slate-900 dark:text-white">{person.fullName}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              {isGroup
                ? 'Group conversation · Say hello to everyone'
                : `SZMC Alumni Network · MBBS Batch ${person.batchYear || 'Colleague'}`}
            </p>
            {!isAnnouncement && (
              <button
                type="button"
                onClick={sendThumbsUp}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0084FF] text-white text-xs font-bold hover:bg-[#0073E6] shadow-sm transition-transform active:scale-95 cursor-pointer"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                Say Wave 👋
              </button>
            )}
          </div>
        )}

        {messages.map((message, index) => {
          const mine = message.senderId === myId;
          const previous = messages[index - 1];
          const showDay = !previous || formatDayLabel(previous.createdAt) !== formatDayLabel(message.createdAt);
          const deleted = Boolean(message.deletedAt);
          const editing = editingId === message.id;
          const isSystem = message.type === 'system';

          // Resolve sender info for group threads
          const senderPerson = !mine ? participantById.get(message.senderId) : undefined;
          const senderAvatar = senderPerson?.avatarUrl || person.avatarUrl;
          const senderName = senderPerson?.fullName || person.fullName;

          // Resolve legacy + modern image payloads
          let textContent = message.body;
          let imagePayload: string | null = message.mediaUrl ?? null;
          if (!imagePayload && message.body.includes('[image]:')) {
            const parts = message.body.split('[image]:');
            textContent = parts[0]?.trim() || '';
            imagePayload = parts[1]?.trim() || null;
          } else if (!imagePayload && (message.body.startsWith('data:image/') || message.type === 'image')) {
            imagePayload = message.body;
            textContent = '';
          }
          if (message.type === 'image' && message.mediaUrl && message.body === 'Photo') {
            textContent = '';
          }

          // Reply quote target & special card parsing
          const quotedMsg = message.replyToMessageId ? messageById.get(message.replyToMessageId) : undefined;
          const huddleInfo = !deleted && textContent ? extractHuddleRoomFromText(textContent) : null;
          const structuredCard = !deleted && textContent ? parseStructuredChatMessage(textContent) : null;

          // Aggregate reactions (poll choice emojis are rendered directly inside Poll cards)
          const msgReactions = reactionsByMessageId[message.id] ?? [];
          const pollEmojiSet = new Set<string>(POLL_OPTION_EMOJIS);
          const reactionSummary = Array.from(
            msgReactions
              .filter((r) => !(structuredCard?.kind === 'poll' && pollEmojiSet.has(r.emoji)))
              .reduce((map, r) => {
                const entry = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, reactedByMe: false };
                entry.count += 1;
                if (r.profileId === myId) entry.reactedByMe = true;
                map.set(r.emoji, entry);
                return map;
              }, new Map<string, { emoji: string; count: number; reactedByMe: boolean }>())
              .values()
          );

          const actionsVisible =
            activeActionMessageId === message.id ||
            confirmDeleteId === message.id ||
            reactionPickerMsgId === message.id;

          const isProfileCard =
            structuredCard?.kind === 'profile_card' || message.type === 'ProfileShareCard';
          const canEdit = mine && !imagePayload && message.type !== 'like' && !isSystem && !isProfileCard;
          const canDelete = mine || isSuperAdmin;
          const canInteract =
            !deleted &&
            !editing &&
            !isSystem &&
            message.status !== 'sending' &&
            message.status !== 'failed';

          if (isSystem && !deleted) {
            return (
              <React.Fragment key={message.id}>
                {showDay && (
                  <div className="flex justify-center py-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-3 py-0.5 rounded-full shadow-2xs border border-slate-200/50 dark:border-slate-700/50">
                      {formatDayLabel(message.createdAt)}
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-1" data-message-id={message.id}>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800/70 px-3 py-1 rounded-full text-center max-w-[85%]">
                    {message.body}
                  </span>
                </div>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={message.id}>
              {showDay && (
                <div className="flex justify-center py-2">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-3 py-0.5 rounded-full shadow-2xs border border-slate-200/50 dark:border-slate-700/50">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              )}

              <div
                data-message-id={message.id}
                className={`group flex items-end gap-2 rounded-2xl transition-colors duration-500 ${
                  highlightedMessageId === message.id
                    ? 'bg-[#0084FF]/10 ring-1 ring-[#0084FF]/30 p-1 -m-1'
                    : ''
                } ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && (
                  <img
                    src={senderAvatar}
                    alt={senderName}
                    className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
                  />
                )}

                <div className={`max-w-[80%] sm:max-w-[66%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {isGroup && !mine && (
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-2 mb-0.5 truncate max-w-full">
                      {senderName}
                    </span>
                  )}

                  {editing ? (
                    <div className="w-full min-w-[230px] p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-[#0084FF] shadow-lg">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-white outline-none"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={savingEdit || !editDraft.trim()}
                          className="px-3 py-1 rounded-full text-xs font-bold text-white bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 cursor-pointer"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group/msg flex flex-col gap-1 max-w-full">
                      {/* Quoted / Replied-To Message Snippet */}
                      {!deleted && message.replyToMessageId && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(message.replyToMessageId!)}
                          className={`text-left rounded-xl px-2.5 py-1.5 text-[11px] max-w-full border transition-colors cursor-pointer ${
                            mine
                              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-slate-700 dark:text-slate-200'
                              : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <p className="font-bold text-[10px] text-[#0084FF] truncate">
                            Replying to {quotedMsg ? getSenderLabel(quotedMsg.senderId) : 'message'}
                          </p>
                          <p className="truncate opacity-80">
                            {quotedMsg
                              ? quotedMsg.deletedAt
                                ? 'Message deleted'
                                : quotedMsg.type === 'image' || quotedMsg.mediaUrl
                                ? quotedMsg.body && quotedMsg.body !== 'Photo'
                                  ? `📷 ${quotedMsg.body}`
                                  : '📷 Photo'
                                : formatStructuredPreview(quotedMsg.body) || quotedMsg.body
                              : 'Earlier message in thread'}
                          </p>
                        </button>
                      )}

                      {/* Image Attachment (In-App Lightbox + Live DM Shared Canvas Annotator) */}
                      {!deleted && imagePayload && (
                        <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(imagePayload)}
                            className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:opacity-95 transition-opacity cursor-pointer block text-left"
                            aria-label="Open full-size photo"
                          >
                            <img
                              src={imagePayload}
                              alt="Chat attachment"
                              loading="lazy"
                              className="w-full max-h-64 object-cover"
                            />
                          </button>
                          {canAnnotateDm && (
                            <button
                              type="button"
                              onClick={() => openAnnotatorForImage(imagePayload, message.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0084FF] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0084FF] shadow-2xs transition-colors cursor-pointer"
                            >
                              <PenTool className="w-3 h-3 text-[#0084FF]" />
                              <span>
                                {liveDmSession &&
                                (liveDmSession.sourceMessageId === message.id ||
                                  liveDmSession.imageUrl === imagePayload)
                                  ? 'Join Live Annotate'
                                  : 'Annotate Image'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Text, Structured SZMC Card, or Like Bubble (tap to toggle touch actions) */}
                      {(deleted || textContent || message.type === 'like' || (!imagePayload && !textContent)) && (
                        <div
                          onClick={() => {
                            if (!canInteract) return;
                            setConfirmDeleteId(null);
                            setReactionPickerMsgId(null);
                            setActiveActionMessageId((prev) => (prev === message.id ? null : message.id));
                          }}
                          className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words transition-all cursor-pointer select-text ${
                            message.status === 'sending'
                              ? 'opacity-75'
                              : message.status === 'failed'
                              ? 'opacity-80 ring-1 ring-rose-400'
                              : ''
                          } ${
                            deleted
                              ? 'italic text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-4 py-2.5 rounded-2xl cursor-default'
                              : message.type === 'like' || textContent === '👍'
                              ? 'text-4xl py-1'
                              : isProfileCard
                              ? 'bg-transparent p-0 shadow-none'
                              : mine
                              ? 'bg-gradient-to-r from-[#0084FF] to-[#0099FF] text-white rounded-[20px] rounded-br-[4px] px-4 py-2.5 shadow-sm shadow-[#0084FF]/25'
                              : 'bg-[#F0F2F5] dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-[20px] rounded-bl-[4px] px-4 py-2.5'
                          }`}
                        >
                          {deleted ? (
                            'This message was deleted'
                          ) : message.type === 'like' ? (
                            '👍'
                          ) : structuredCard ? (
                            <StructuredChatCard
                              data={structuredCard}
                              mine={mine}
                              myId={myId}
                              reactions={msgReactions}
                              onViewProfile={onViewProfile}
                              onToggleReaction={
                                onToggleReaction && canInteract
                                  ? (em) => onToggleReaction(message.id, em)
                                  : undefined
                              }
                              onQuickReply={
                                (!isAnnouncement || isSuperAdmin) && !conversation.isBlockedEitherWay && canInteract
                                  ? (prefill) => {
                                      setReplyingTo(message);
                                      if (prefill && !draft.trim()) {
                                        setDraft(prefill);
                                      }
                                      composerRef.current?.focus();
                                    }
                                  : undefined
                              }
                            />
                          ) : (
                            <RichMessageText text={textContent} mine={mine} />
                          )}

                          {huddleInfo && (
                            <div className="mt-2 pt-2 border-t border-current/15">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHuddleMode(huddleInfo.mode);
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                                  mine
                                    ? 'bg-white text-[#0084FF] hover:bg-blue-50'
                                    : 'bg-[#0084FF] text-white hover:bg-[#0073E6]'
                                }`}
                              >
                                {huddleInfo.mode === 'audio' ? (
                                  <Phone className="w-3.5 h-3.5" />
                                ) : (
                                  <Video className="w-3.5 h-3.5" />
                                )}
                                <span>Join Huddle in App</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Aggregated Reaction Pills */}
                      {!deleted && reactionSummary.length > 0 && (
                        <div className={`flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                          {reactionSummary.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => onToggleReaction?.(message.id, r.emoji)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors cursor-pointer ${
                                r.reactedByMe
                                  ? 'bg-[#0084FF]/15 border-[#0084FF]/50 text-[#0084FF] font-bold'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300'
                              }`}
                              title="Toggle reaction"
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 && <span className="text-[10px] tabular-nums">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Touch + Desktop Hover Action Bar (Inline to avoid mobile edge clipping) */}
                      {canInteract && (
                        <div
                          className={`${
                            actionsVisible ? 'flex' : 'hidden group-hover/msg:flex'
                          } flex-wrap items-center gap-1 mt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          {confirmDeleteId === message.id ? (
                            <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-full shadow-md border border-rose-200 dark:border-rose-800">
                              <button
                                type="button"
                                onClick={() => handleConfirmDelete(message.id)}
                                className="px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                              >
                                {mine ? 'Delete' : 'Remove'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : reactionPickerMsgId === message.id ? (
                            <div className="inline-flex items-center gap-0.5 bg-white dark:bg-slate-800 px-1.5 py-1 rounded-full shadow-md border border-slate-200 dark:border-slate-700">
                              {REACTION_EMOJIS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => {
                                    onToggleReaction?.(message.id, em);
                                    setReactionPickerMsgId(null);
                                    setActiveActionMessageId(null);
                                  }}
                                  className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-sm transition-transform hover:scale-125 cursor-pointer"
                                  aria-label={`React with ${em}`}
                                >
                                  {em}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setReactionPickerMsgId(null)}
                                className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                                aria-label="Close reaction picker"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-0.5 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700">
                              {onToggleReaction && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setReactionPickerMsgId(message.id);
                                  }}
                                  title="React"
                                  aria-label="React to message"
                                  className="p-1.5 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  <Smile className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingTo(message);
                                  setActiveActionMessageId(null);
                                  composerRef.current?.focus();
                                }}
                                title="Reply"
                                aria-label="Reply to message"
                                className="p-1.5 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteId(null);
                                    setEditingId(message.id);
                                    setEditDraft(message.body);
                                  }}
                                  title="Edit"
                                  aria-label="Edit message"
                                  className="p-1.5 rounded-full text-slate-500 hover:text-[#0084FF] hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(message.id)}
                                  title={mine ? 'Delete' : 'Remove message (Admin moderation)'}
                                  aria-label={mine ? 'Delete message' : 'Remove message'}
                                  className="p-1.5 rounded-full text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message timestamp, delivery state, and REAL read receipts */}
                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                    {message.status === 'failed' ? (
                      <div className="flex items-center gap-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                        <span>Failed to send</span>
                        {onRetrySend && (
                          <button
                            type="button"
                            onClick={() => onRetrySend(message)}
                            className="inline-flex items-center gap-0.5 underline hover:text-rose-700 cursor-pointer"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Retry
                          </button>
                        )}
                        {onDismissFailed && (
                          <button
                            type="button"
                            onClick={() => onDismissFailed(message.id)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {message.isSilent && !deleted && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300"
                            title="Delivered quietly without alert sound"
                          >
                            <BellOff className="w-2.5 h-2.5" />
                            <span>Silent</span>
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {message.status === 'sending' ? 'Sending...' : formatTime(message.createdAt)}
                          {message.editedAt && !deleted ? ' · edited' : ''}
                        </span>
                        {mine && !deleted && (
                          message.status === 'sending' ? (
                            <Clock className="w-3 h-3 text-slate-400" aria-label="Sending" />
                          ) : readReceiptsEnabled &&
                            conversation.peerLastReadAt &&
                            message.createdAt <= conversation.peerLastReadAt ? (
                            <span title="Seen">
                              <CheckCheck className="w-3 h-3 text-[#0084FF]" />
                            </span>
                          ) : (
                            <span title="Delivered">
                              <Check className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                            </span>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Meta Messenger 3-Dot Typing Bubble */}
        {typingText && (
          <div className="flex items-end gap-2 animate-fadeIn">
            <img
              src={person.avatarUrl}
              alt={person.fullName}
              className="w-7 h-7 rounded-full object-cover shrink-0 mb-1"
            />
            <div className="bg-[#F0F2F5] dark:bg-slate-800 px-4 py-3 rounded-[20px] rounded-bl-[4px] flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Floating jump-to-latest pill when scrolled up and a new message arrives */}
      {hasUnseenBelow && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={scrollToBottom}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold shadow-lg cursor-pointer animate-fadeIn"
          >
            <span>New messages</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quick Emoji Bar */}
      {showEmojiPicker && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 overflow-x-auto">
          {COMPOSER_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleAddEmoji(em)}
              className="text-xl p-1.5 hover:scale-125 transition-transform cursor-pointer"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Reply Preview Strip */}
      {replyingTo && (
        <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <Reply className="w-3.5 h-3.5 text-[#0084FF] shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#0084FF] truncate">
                Replying to {getSenderLabel(replyingTo.senderId)}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {replyingTo.type === 'image' || replyingTo.mediaUrl
                  ? replyingTo.body && replyingTo.body !== 'Photo'
                    ? `📷 ${replyingTo.body}`
                    : '📷 Photo'
                  : formatStructuredPreview(replyingTo.body) || replyingTo.body}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            aria-label="Cancel reply"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Photo Preview & Upload Error */}
      {(pendingImagePreviewUrl || uploadError) && (
        <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 space-y-1.5">
          {uploadError && (
            <div className="flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
              <span className="truncate">{uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {pendingImagePreviewUrl && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={pendingImagePreviewUrl}
                  alt="Selected attachment preview"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {pendingImageFile?.name || 'Photo ready to send'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {uploadingImage ? 'Uploading photo...' : 'Add an optional caption or press send'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canAnnotateDm && (
                  <button
                    type="button"
                    onClick={() => void handleAnnotatePendingImage()}
                    disabled={uploadingImage || sending}
                    className="px-2.5 py-1.5 rounded-xl bg-[#0084FF]/10 hover:bg-[#0084FF]/20 text-[#0084FF] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                  >
                    <PenTool className="w-3 h-3" />
                    <span>Annotate</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearPendingImage}
                  disabled={uploadingImage}
                  aria-label="Remove attached photo"
                  className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive SZMC Medical & Alumni Tools Drawer */}
      {composerTool && !conversation.isBlockedEitherWay && !(isAnnouncement && !isSuperAdmin) && (
        <div className="px-3.5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 animate-fadeIn">
          {composerTool === 'menu' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  SZMC Alumni Tools
                </span>
                <button
                  type="button"
                  onClick={() => setComposerTool(null)}
                  aria-label="Close tools menu"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                ref={scanAnnotateInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handlePickScanToAnnotate(e)}
                className="hidden"
              />
              <div className={`grid gap-2 ${canAnnotateDm && currentProfile ? 'grid-cols-2 sm:grid-cols-5' : canAnnotateDm || currentProfile ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                <button
                  type="button"
                  onClick={() => setComposerTool('consult')}
                  className="min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0084FF] text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Stethoscope className="w-4 h-4 text-[#0084FF] shrink-0" />
                  <span className="truncate">Consult</span>
                </button>
                <button
                  type="button"
                  onClick={() => setComposerTool('lifeline')}
                  className="min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Droplet className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="truncate">Blood Ping</span>
                </button>
                <button
                  type="button"
                  onClick={() => setComposerTool('poll')}
                  className="min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0084FF] text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <BarChart2 className="w-4 h-4 text-[#0084FF] shrink-0" />
                  <span className="truncate">Quick Poll</span>
                </button>
                {currentProfile && (
                  <button
                    type="button"
                    onClick={() => void handleSendMyProfileCard()}
                    disabled={sending || uploadingImage}
                    className="min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="truncate">My Card</span>
                  </button>
                )}
                {canAnnotateDm && (
                  <button
                    type="button"
                    onClick={() => scanAnnotateInputRef.current?.click()}
                    disabled={uploadingImage || sending}
                    className="min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#0084FF] text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <PenTool className="w-4 h-4 text-[#0084FF] shrink-0" />
                    <span className="truncate">Annotate Scan</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {composerTool === 'consult' && (
            <form onSubmit={(e) => void handleSendConsultCard(e)} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Stethoscope className="w-4 h-4 text-[#0084FF]" />
                  <span>Send Clinical Consult Card</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setComposerTool('menu')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTool(null)}
                    aria-label="Close consult builder"
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={consultSpecialty}
                  onChange={(e) => setConsultSpecialty(e.target.value)}
                  maxLength={60}
                  placeholder="Specialty (e.g. Cardiology)"
                  className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0084FF]"
                />
                <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800 gap-1">
                  {(['Routine', 'Urgent'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConsultUrgency(level)}
                      className={`py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        consultUrgency === level
                          ? level === 'Urgent'
                            ? 'bg-rose-600 text-white'
                            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={consultSummary}
                onChange={(e) => setConsultSummary(e.target.value)}
                rows={2}
                maxLength={600}
                placeholder="Brief anonymized presentation / key findings..."
                className="w-full resize-none px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0084FF]"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={consultQuestion}
                  onChange={(e) => setConsultQuestion(e.target.value)}
                  maxLength={240}
                  placeholder="Specific question for colleague (optional)"
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0084FF]"
                />
                <button
                  type="submit"
                  disabled={!consultSummary.trim() || sending}
                  className="px-4 py-2 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Send Consult
                </button>
              </div>
            </form>
          )}

          {composerTool === 'lifeline' && (
            <form onSubmit={(e) => void handleSendLifelineCard(e)} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Droplet className="w-4 h-4 text-rose-600" />
                  <span>Send Blood / Referral Ping</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setComposerTool('menu')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTool(null)}
                    aria-label="Close blood ping builder"
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={lifelineGroup}
                  onChange={(e) => setLifelineGroup(e.target.value)}
                  aria-label="Blood group or referral type"
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-rose-500"
                >
                  {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Patient Referral'].map((grp) => (
                    <option key={grp} value={grp}>
                      {grp}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={lifelineHospital}
                  onChange={(e) => setLifelineHospital(e.target.value)}
                  maxLength={100}
                  placeholder="Hospital & City (e.g. SZMC Hospital, Bogura)"
                  className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-rose-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={lifelineNote}
                  onChange={(e) => setLifelineNote(e.target.value)}
                  maxLength={300}
                  placeholder="Units / Ward / Contact instructions..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={!lifelineHospital.trim() || sending}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Send Ping
                </button>
              </div>
            </form>
          )}

          {composerTool === 'poll' && (
            <form onSubmit={(e) => void handleSendPollCard(e)} className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <BarChart2 className="w-4 h-4 text-[#0084FF]" />
                  <span>Create Quick Poll</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setComposerTool('menu')}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTool(null)}
                    aria-label="Close poll builder"
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={160}
                placeholder="Ask a question (e.g. Best date for Batch reunion dinner?)"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0084FF]"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {pollOptions.map((opt, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[idx] = e.target.value;
                      setPollOptions(next);
                    }}
                    maxLength={80}
                    placeholder={`Option ${idx + 1}`}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0084FF]"
                  />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                {pollOptions.length < 4 ? (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ''])}
                    className="text-xs font-semibold text-[#0084FF] hover:underline cursor-pointer"
                  >
                    + Add option
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">Max 4 options</span>
                )}
                <button
                  type="submit"
                  disabled={
                    !pollQuestion.trim() ||
                    pollOptions.filter((o) => o.trim()).length < 2 ||
                    sending
                  }
                  className="px-4 py-2 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Post Poll
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Warning Banner when recipient is In OT or On Call */}
      {!conversation.isBlockedEitherWay &&
        !(isAnnouncement && !isSuperAdmin) &&
        !isGroup &&
        !isAnnouncement &&
        isQuietRecommendedStatus(peerClinicalStatus) && (
          <div className="px-3.5 py-2 border-t border-amber-200 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-medium truncate">
                Dr. {person.fullName.split(' ')[0]} is currently{' '}
                <strong className="font-bold">{CLINICAL_STATUS_META[peerClinicalStatus].label}</strong>
                {' — '}non-urgent messages are best sent quietly.
              </span>
            </div>
            {!sendQuietly ? (
              <button
                type="button"
                onClick={() => setSendQuietly(true)}
                className="inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <BellOff className="w-3 h-3" />
                <span>Send Quietly</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                <BellOff className="w-3 h-3" />
                <span>Quiet mode on</span>
              </span>
            )}
          </div>
        )}

      {/* Composer area: blocked guard, read-only announcement guard, or standard composer */}
      {conversation.isBlockedEitherWay ? (
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            <Ban className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              {conversation.isBlockedByMe
                ? `You blocked ${person.fullName}. Unblock them to send messages again.`
                : 'You can no longer send messages to this conversation.'}
            </span>
          </div>
          {conversation.isBlockedByMe && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold transition-colors cursor-pointer shrink-0"
            >
              Manage Block
            </button>
          )}
        </div>
      ) : isAnnouncement && !isSuperAdmin ? (
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Megaphone className="w-4 h-4 text-[#0084FF] shrink-0" />
          <span>Official SZMC Alumni Announcements channel (read-only)</span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="p-2.5 sm:p-3 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center gap-1 sm:gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImagePick}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker(false);
              setComposerTool((prev) => (prev ? null : 'menu'));
            }}
            title="SZMC Medical & Alumni Tools"
            aria-label="Open SZMC Medical and Alumni Tools"
            className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              composerTool
                ? 'bg-[#0084FF] text-white'
                : 'text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800'
            }`}
          >
            <Plus className={`w-5 h-5 transition-transform ${composerTool ? 'rotate-45' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage || sending}
            title="Attach photo"
            aria-label="Attach photo"
            className="min-w-[40px] min-h-[40px] rounded-full text-[#0084FF] hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Rounded Input Pill */}
          <div className="flex-1 flex items-center bg-[#F0F2F5] dark:bg-slate-800 rounded-full px-3.5 sm:px-4 py-1.5 min-w-0">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                onTyping?.();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={
                pendingImageFile
                  ? 'Add a caption...'
                  : sendQuietly
                  ? 'Send quietly (no alert sound)...'
                  : 'Aa'
              }
              aria-label="Message"
              className="w-full resize-none bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none leading-relaxed max-h-24 py-1"
            />
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title="Choose emoji"
              aria-label="Choose emoji"
              className="p-1 text-[#0084FF] hover:opacity-80 transition-opacity cursor-pointer shrink-0"
            >
              <Smile className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSendQuietly((prev) => !prev)}
            aria-pressed={sendQuietly}
            title={
              sendQuietly
                ? 'Send Quietly enabled (recipient will not hear alert sound)'
                : 'Send Quietly (deliver without notification sound)'
            }
            aria-label="Toggle Send Quietly"
            className={`min-h-[40px] min-w-[40px] px-2.5 rounded-full border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              sendQuietly
                ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-slate-100 text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BellOff className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Send Quietly</span>
          </button>

          {draft.trim() || pendingImageFile ? (
            <button
              type="submit"
              disabled={sending || uploadingImage}
              aria-label={sendQuietly ? 'Send quietly' : 'Send message'}
              className="w-10 h-10 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white flex items-center justify-center shadow-sm shadow-[#0084FF]/30 transition-transform active:scale-95 disabled:opacity-60 cursor-pointer shrink-0"
            >
              {sending || uploadingImage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={sendThumbsUp}
              disabled={sending}
              title={sendQuietly ? 'Send Like quietly' : 'Send Like'}
              aria-label="Send Like"
              className="min-w-[40px] min-h-[40px] rounded-full text-[#0084FF] hover:scale-110 flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <ThumbsUp className="w-5 h-5 fill-[#0084FF]" />
            </button>
          )}
        </form>
      )}

      {/* In-App Full-Size Photo Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <div
            className="absolute top-4 right-4 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {canAnnotateDm && (
              <button
                type="button"
                onClick={() => openAnnotatorForImage(lightboxUrl)}
                className="min-h-[44px] px-4 rounded-full bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <PenTool className="w-4 h-4" />
                <span>Annotate Live</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close photo"
              className="min-w-[44px] min-h-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxUrl}
            alt="Full-size attachment"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[86vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Shared Clinical Image Annotation Canvas (DM Live Sync) */}
      {annotationTarget && canAnnotateDm && (
        <SharedImageAnnotatorModal
          isOpen={true}
          conversationId={conversation.id}
          myId={myId}
          myDisplayName={myDisplayName}
          myAvatarUrl={myAvatarUrl}
          peerName={person.fullName}
          target={annotationTarget}
          onClose={() => setAnnotationTarget(null)}
          onSaveToThread={async ({ mediaUrl, caption: annotatedCaption, replyToMessageId }) =>
            onSend(annotatedCaption, {
              type: 'image',
              mediaUrl,
              replyToMessageId: replyToMessageId ?? null,
              isSilent: sendQuietly,
            })
          }
        />
      )}

      {/* In-App Audio / Video Huddle Modal */}
      {huddleMode && (
        <HuddleModal
          isOpen={true}
          mode={huddleMode}
          conversationId={conversation.id}
          peerName={person.fullName}
          myDisplayName={myDisplayName}
          onClose={() => setHuddleMode(null)}
          onPostInvite={
            !conversation.isBlockedEitherWay && (!isAnnouncement || isSuperAdmin)
              ? async (inviteText) => {
                  await onSend(inviteText, { type: 'text' });
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
