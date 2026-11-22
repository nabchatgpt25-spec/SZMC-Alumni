import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Send,
  Share2,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { AlumniProfile } from '../types';
import type { ChatConversation } from '../types/messaging';
import { useAuth } from '../context/AuthContext';
import { useMessagingProfileId } from '../hooks/useMessagingProfileId';
import { listConversations, sendProfileShareCard } from '../services/messagingService';
import {
  fetchSocialGraphSnapshot,
  sendConnectionRequest,
  toggleFollowUser,
  type SocialGraphSnapshot,
} from '../services/socialGraphService';
import {
  renderFrostedProfileCardPng,
  type FrostedCardTheme,
} from '../utils/profileCardCanvas';
import { FacebookIcon, WhatsAppIcon } from './SocialIcons';

interface FrostedProfileCardModalProps {
  profile: AlumniProfile | null;
  isOpen: boolean;
  postsCountOverride?: number;
  onClose: () => void;
  onStartMessage?: (targetProfile: AlumniProfile) => void;
  onOpenFullProfile?: (profileId: number) => void;
  onOpenConversation?: (conversationId: string) => void;
  onEditOwnProfile?: () => void;
  onRequireLogin?: () => void;
}

const THEME_CONFIG: Record<
  FrostedCardTheme,
  {
    label: string;
    orbOne: string;
    orbTwo: string;
    orbThree: string;
    ringGradient: string;
    primaryBtn: string;
  }
> = {
  acrylic: {
    label: 'Studio Acrylic',
    orbOne: 'from-rose-400/45 via-amber-300/30 to-transparent',
    orbTwo: 'from-violet-500/45 via-indigo-400/30 to-transparent',
    orbThree: 'from-orange-300/30 via-pink-500/25 to-transparent',
    ringGradient: 'from-amber-300 via-rose-400 to-violet-500',
    primaryBtn: 'bg-indigo-400/80 hover:bg-indigo-400/95 text-white',
  },
  sapphire: {
    label: 'Sapphire Glass',
    orbOne: 'from-sky-400/45 via-cyan-300/30 to-transparent',
    orbTwo: 'from-blue-600/45 via-indigo-500/30 to-transparent',
    orbThree: 'from-cyan-300/30 via-blue-500/25 to-transparent',
    ringGradient: 'from-cyan-300 via-sky-400 to-[#0084FF]',
    primaryBtn: 'bg-[#0084FF]/85 hover:bg-[#0084FF] text-white',
  },
  emerald: {
    label: 'Emerald Dusk',
    orbOne: 'from-emerald-400/40 via-teal-300/25 to-transparent',
    orbTwo: 'from-teal-500/45 via-sky-500/30 to-transparent',
    orbThree: 'from-emerald-300/25 via-cyan-500/25 to-transparent',
    ringGradient: 'from-emerald-200 via-emerald-400 to-sky-500',
    primaryBtn: 'bg-emerald-500/80 hover:bg-emerald-500/95 text-white',
  },
};

function sanitizeExternalUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const FrostedProfileCardModal: React.FC<FrostedProfileCardModalProps> = ({
  profile,
  isOpen,
  postsCountOverride,
  onClose,
  onStartMessage,
  onOpenFullProfile,
  onOpenConversation,
  onEditOwnProfile,
  onRequireLogin,
}) => {
  const { isLoggedIn, currentUser, isAdminUser } = useAuth();
  const { effectiveProfileId } = useMessagingProfileId(isLoggedIn ? currentUser.id : undefined);
  const myMessagingId = effectiveProfileId ?? currentUser.id;
  const isSuperAdmin = currentUser.role === 'admin' || isAdminUser;

  const [theme, setTheme] = useState<FrostedCardTheme>('acrylic');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedContact, setCopiedContact] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busySocialAction, setBusySocialAction] = useState<'follow' | 'connect' | null>(null);

  // Share to Active DM or Group Chat Picker
  const [showChatPicker, setShowChatPicker] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [chatPickerError, setChatPickerError] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [chatSearch, setChatSearch] = useState('');
  const [chatNote, setChatNote] = useState('');
  const [sendingConvId, setSendingConvId] = useState<string | null>(null);
  const [sentConvIds, setSentConvIds] = useState<Record<string, boolean>>({});

  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [snap, setSnap] = useState<SocialGraphSnapshot>({
    connectionStatus: 'none',
    connectionId: null,
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    connectionsCount: 0,
  });

  const isMine = Boolean(
    isLoggedIn &&
      profile &&
      (profile.id === currentUser.id || profile.userId === currentUser.id)
  );

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !profile) return '';
    const u = new URL(window.location.origin + window.location.pathname);
    u.searchParams.set('card', String(profile.id));
    return u.toString();
  }, [profile]);

  const effectivePostsCount = postsCountOverride ?? profile?.postsCount ?? 0;

  useEffect(() => {
    setAvatarFailed(false);
    setShowContactDrawer(false);
    setShowChatPicker(false);
    setChatSearch('');
    setChatNote('');
    setChatFilter('all');
    setSentConvIds({});
    setChatPickerError(null);
    setCopiedLink(false);
    setActionNotice(null);
    setTilt({ rx: 0, ry: 0 });
  }, [profile?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !showChatPicker || !isLoggedIn || !myMessagingId) return;
    let cancelled = false;
    setLoadingConversations(true);
    setChatPickerError(null);

    void listConversations(myMessagingId)
      .then((list) => {
        if (cancelled) return;
        const shareable = list.filter((c) => {
          if (c.isBlockedEitherWay) return false;
          if (c.type === 'announcement' && !isSuperAdmin) return false;
          return true;
        });
        setConversations(shareable);
      })
      .catch((err) => {
        if (!cancelled) {
          setChatPickerError(err instanceof Error ? err.message : 'Could not load your active chats.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, showChatPicker, isLoggedIn, myMessagingId, isSuperAdmin]);

  const loadSnapshot = useCallback(async () => {
    if (!profile?.id) return;
    const data = await fetchSocialGraphSnapshot(
      isLoggedIn ? currentUser.id : undefined,
      profile.id
    );
    setSnap(data);
  }, [isLoggedIn, currentUser.id, profile?.id]);

  useEffect(() => {
    if (!isOpen || !profile?.id) return;
    void loadSnapshot();
  }, [isOpen, profile?.id, loadSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredConversations = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return conversations.filter((conv) => {
      const isGrp = conv.type === 'group' || conv.type === 'announcement';
      if (chatFilter === 'direct' && isGrp) return false;
      if (chatFilter === 'group' && !isGrp) return false;
      if (!q) return true;
      const title = (conv.title || conv.person.fullName || '').toLowerCase();
      const prof = (conv.person.profession || '').toLowerCase();
      return title.includes(q) || prof.includes(q);
    });
  }, [conversations, chatFilter, chatSearch]);

  if (!isOpen || !profile) return null;

  const palette = THEME_CONFIG[theme];
  const fbUrl = sanitizeExternalUrl(profile.fbLink);
  const whatsappDigits = profile.whatsapp ? profile.whatsapp.replace(/[^0-9]/g, '') : '';
  const batchLabel = profile.batchYear
    ? `SZMC BATCH ${profile.batchYear < 10 ? `0${profile.batchYear}` : profile.batchYear}`
    : 'SZMC ALUMNI';

  const initials = profile.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      e.pointerType !== 'mouse' ||
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const py = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    setTilt({ rx: Number((-py * 8).toFixed(2)), ry: Number((px * 9).toFixed(2)) });
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setActionNotice('Copy failed — use the link shown on the card.');
    }
  };

  const handleDownloadPng = async () => {
    if (downloading) return;
    setDownloading(true);
    setActionNotice(null);
    try {
      const blob = await renderFrostedProfileCardPng({
        profile,
        metrics: {
          postsCount: effectivePostsCount,
          followersCount: snap.followersCount,
          followingCount: snap.followingCount,
        },
        shareUrl,
        theme,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = profile.fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      a.href = url;
      a.download = `szmc-card-${slug || profile.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionNotice('Card PNG downloaded — ready to share anywhere.');
    } catch {
      setActionNotice('Could not render PNG export. Try copying your direct card link.');
    } finally {
      setDownloading(false);
    }
  };

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.fullName} · SZMC Alumni`,
          text: `Connect with ${profile.fullName} (MBBS Batch ${profile.batchYear}) on SZMC Alumni.`,
          url: shareUrl,
        });
        return;
      } catch {
        /* fallback to clipboard copy */
      }
    }
    await handleCopyShareLink();
  };

  const handleFollowAction = async () => {
    if (isMine) {
      onClose();
      onEditOwnProfile?.();
      return;
    }
    if (!isLoggedIn || !currentUser.id) {
      onRequireLogin?.();
      return;
    }
    setBusySocialAction('follow');
    try {
      const res = await toggleFollowUser(
        currentUser.id,
        profile.id,
        snap.isFollowing,
        currentUser.fullName
      );
      if (res.success) {
        setSnap((prev) => ({
          ...prev,
          isFollowing: res.isFollowing,
          followersCount: res.isFollowing
            ? prev.followersCount + 1
            : Math.max(0, prev.followersCount - 1),
        }));
      }
    } finally {
      setBusySocialAction(null);
    }
  };

  const handleConnectOrShareAction = async () => {
    if (isMine) {
      await handleNativeShare();
      return;
    }
    if (!isLoggedIn || !currentUser.id) {
      onRequireLogin?.();
      return;
    }
    if (snap.connectionStatus !== 'none') return;
    setBusySocialAction('connect');
    try {
      const res = await sendConnectionRequest(
        currentUser.id,
        profile.id,
        currentUser.fullName
      );
      if (res.success) {
        setSnap((prev) => ({
          ...prev,
          connectionStatus: 'outgoing_pending',
          connectionId: res.connectionId ?? prev.connectionId,
        }));
        setActionNotice(`Connection request sent to ${profile.fullName.split(' ')[0]}.`);
      }
    } finally {
      setBusySocialAction(null);
    }
  };

  const handleMessageAction = () => {
    if (!isLoggedIn) {
      onRequireLogin?.();
      return;
    }
    onClose();
    onStartMessage?.(profile);
  };

  const handleToggleShareToChat = () => {
    if (!isLoggedIn) {
      onRequireLogin?.();
      return;
    }
    setShowChatPicker((prev) => !prev);
  };

  const handleSendCardToConversation = async (conv: ChatConversation) => {
    if (!myMessagingId || sendingConvId) return;
    setSendingConvId(conv.id);
    setChatPickerError(null);
    try {
      await sendProfileShareCard(conv.id, myMessagingId, profile, {
        note: chatNote.trim() || undefined,
        profileUrl: shareUrl,
      });
      setSentConvIds((prev) => ({ ...prev, [conv.id]: true }));
      const label = conv.title || conv.person.fullName || 'conversation';
      setActionNotice(`ProfileShareCard sent to ${label}.`);
    } catch (err) {
      setChatPickerError(
        err instanceof Error ? err.message : 'Could not share profile card to this chat.'
      );
    } finally {
      setSendingConvId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#05070e]/92 backdrop-blur-md overflow-y-auto animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="frosted-card-title"
    >
      <div
        className="w-full max-w-[580px] my-auto flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Studio Toolbar: Lighting Themes + Open Full Profile */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md">
            {(Object.keys(THEME_CONFIG) as FrostedCardTheme[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  theme === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-white/75 hover:text-white'
                }`}
              >
                {THEME_CONFIG[key].label}
              </button>
            ))}
          </div>

          {onOpenFullProfile && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullProfile(profile.id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <span>Full Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Luminous Ambient Studio Showcase Stage */}
        <div
          className="relative w-full py-4 sm:py-6 px-1 sm:px-3 flex items-center justify-center"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
        >
          {/* Ambient Refraction Bokeh Orbs Behind Frosted Glass */}
          <div
            className={`pointer-events-none absolute -top-4 left-4 w-56 h-56 rounded-full bg-radial ${palette.orbOne} blur-3xl`}
          />
          <div
            className={`pointer-events-none absolute top-10 right-2 w-64 h-64 rounded-full bg-radial ${palette.orbTwo} blur-3xl`}
          />
          <div
            className={`pointer-events-none absolute -bottom-4 left-1/3 w-60 h-52 rounded-full bg-radial ${palette.orbThree} blur-3xl`}
          />

          {/* The Translucent Frosted Acrylic Profile Card */}
          <div
            style={{
              transform: `perspective(1100px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            }}
            className="relative w-full rounded-[26px] bg-white/[0.09] backdrop-blur-2xl border border-white/30 shadow-[0_24px_70px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.45)] p-5 sm:p-7 text-white transition-transform duration-200 ease-out overflow-hidden"
          >
            {/* Subtle Specular Glass Diagonal Sheen */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-white/5 opacity-80" />

            {/* Top-Right Close X */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile card"
              className="absolute top-3.5 right-3.5 z-10 min-w-[40px] min-h-[40px] rounded-full text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative z-10 space-y-4">
              {/* Top Row: Luminous Halo Avatar + Name & 3 Tabular Metrics */}
              <div className="flex items-center gap-4 sm:gap-6 pr-8">
                <div
                  className={`p-[3px] rounded-full bg-gradient-to-tr ${palette.ringGradient} shadow-[0_0_24px_rgba(244,114,182,0.35)] shrink-0`}
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-slate-900 ring-2 ring-black/40 flex items-center justify-center">
                    {!avatarFailed && profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.fullName}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xl sm:text-2xl font-extrabold text-white">
                        {initials || 'SZ'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2
                      id="frosted-card-title"
                      className="text-sm sm:text-base font-extrabold tracking-tight text-white uppercase truncate"
                    >
                      {profile.fullName} | {batchLabel}
                    </h2>
                    {profile.verificationStatus === 'verified' && (
                      <ShieldCheck className="w-4 h-4 text-sky-300 shrink-0" />
                    )}
                  </div>

                  {/* 3-Column Tabular Metrics */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-[300px]">
                    <div>
                      <p className="text-lg sm:text-xl font-extrabold leading-tight tabular-nums text-white">
                        {effectivePostsCount.toLocaleString()}
                      </p>
                      <p className="text-[11px] sm:text-xs text-white/75 font-medium">posts</p>
                    </div>
                    <div>
                      <p className="text-lg sm:text-xl font-extrabold leading-tight tabular-nums text-white">
                        {snap.followersCount.toLocaleString()}
                      </p>
                      <p className="text-[11px] sm:text-xs text-white/75 font-medium">followers</p>
                    </div>
                    <div>
                      <p className="text-lg sm:text-xl font-extrabold leading-tight tabular-nums text-white">
                        {snap.followingCount.toLocaleString()}
                      </p>
                      <p className="text-[11px] sm:text-xs text-white/75 font-medium">following</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio, Clinical Credentials & Direct URL */}
              <div className="space-y-1.5 text-xs sm:text-[13px]">
                <p className="text-white/65 font-semibold">
                  {[profile.position || profile.profession || 'SZMC Physician', profile.cadre]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                <div className="space-y-1 text-white/95 leading-relaxed">
                  {profile.institution && (
                    <p className="font-medium">
                      {profile.institution}
                      {profile.city || profile.country
                        ? ` · ${[profile.city, profile.country].filter(Boolean).join(', ')}`
                        : ''}
                    </p>
                  )}
                  {Boolean(profile.degree?.length || profile.specialty?.length) && (
                    <p className="text-white/90">
                      {[
                        profile.degree?.join(', '),
                        profile.specialty?.slice(0, 3).join(' · '),
                      ]
                        .filter(Boolean)
                        .join(' — ')}
                    </p>
                  )}
                  {profile.bio && (
                    <p className="text-white/90 line-clamp-3 whitespace-pre-line">
                      {profile.bio}
                    </p>
                  )}
                  {profile.bloodGroup && (
                    <p className="text-rose-200/95 font-medium">
                      Blood Group {profile.bloodGroup}
                    </p>
                  )}
                </div>

                {/* Clickable / Copyable Share URL */}
                <button
                  type="button"
                  onClick={() => void handleCopyShareLink()}
                  className="pt-1 inline-flex items-center gap-1.5 text-xs font-bold text-white hover:text-sky-200 transition-colors max-w-full cursor-pointer"
                  title="Copy direct profile card link"
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{shareUrl.replace(/^https?:\/\//, '')}</span>
                  {copiedLink && <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />}
                </button>

                {/* Social & Location Row */}
                {(whatsappDigits || fbUrl || profile.city) && (
                  <div className="pt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/85">
                    {whatsappDigits && (
                      <a
                        href={`https://wa.me/${whatsappDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {fbUrl && (
                      <a
                        href={fbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
                      >
                        <FacebookIcon className="w-3.5 h-3.5" />
                        <span>Facebook</span>
                      </a>
                    )}
                    {profile.city && (
                      <span className="inline-flex items-center gap-1 text-white/75">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{[profile.city, profile.country].filter(Boolean).join(', ')}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Expanded Contact Drawer */}
              {showContactDrawer && (
                <div className="p-3 rounded-2xl bg-black/30 border border-white/15 space-y-1.5 text-xs animate-fadeIn">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white/90">Direct Contact Details</span>
                    <button
                      type="button"
                      onClick={() => setShowContactDrawer(false)}
                      aria-label="Close contact details"
                      className="text-white/60 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {profile.phone && (
                    <p className="flex items-center gap-2 text-white/85 tabular-nums">
                      <Phone className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span>{profile.phone}</span>
                    </p>
                  )}
                  {profile.email && (
                    <p className="flex items-center gap-2 text-white/85 truncate">
                      <Mail className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span className="truncate">{profile.email}</span>
                    </p>
                  )}
                  {!profile.phone && !profile.email && !whatsappDigits && (
                    <p className="text-white/65">
                      No direct phone or email listed — reach out via Messenger.
                    </p>
                  )}
                  {(profile.phone || profile.email) && (
                    <button
                      type="button"
                      onClick={() => {
                        const txt = [profile.fullName, profile.phone, profile.email]
                          .filter(Boolean)
                          .join(' · ');
                        void navigator.clipboard?.writeText(txt);
                        setCopiedContact(true);
                        setTimeout(() => setCopiedContact(false), 2000);
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 cursor-pointer"
                    >
                      {copiedContact ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedContact ? 'Contact copied' : 'Copy contact info'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Bottom 4-Button Frosted Glass Action Strip */}
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleFollowAction()}
                  disabled={busySocialAction === 'follow'}
                  className={`flex-1 min-h-[42px] px-3 rounded-xl font-bold text-xs border border-white/25 shadow-sm transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 ${palette.primaryBtn}`}
                >
                  {isMine
                    ? 'Edit Profile'
                    : snap.isFollowing
                    ? 'Following'
                    : isLoggedIn
                    ? 'Follow'
                    : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={handleMessageAction}
                  disabled={isMine && !onStartMessage}
                  className="flex-1 min-h-[42px] px-3 rounded-xl bg-white/16 hover:bg-white/25 border border-white/20 text-white font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  Message
                </button>

                <button
                  type="button"
                  onClick={() => setShowContactDrawer((prev) => !prev)}
                  className={`flex-1 min-h-[42px] px-3 rounded-xl border text-white font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer ${
                    showContactDrawer
                      ? 'bg-white/28 border-white/40'
                      : 'bg-white/16 hover:bg-white/25 border-white/20'
                  }`}
                >
                  Contact
                </button>

                <button
                  type="button"
                  onClick={() => void handleConnectOrShareAction()}
                  disabled={busySocialAction === 'connect'}
                  title={
                    isMine
                      ? 'Share profile card'
                      : snap.connectionStatus === 'connected'
                      ? 'Connected'
                      : snap.connectionStatus === 'outgoing_pending'
                      ? 'Request pending'
                      : 'Connect'
                  }
                  aria-label={isMine ? 'Share profile card' : 'Connect'}
                  className="w-11 min-h-[42px] rounded-xl bg-white/16 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {isMine ? (
                    <Share2 className="w-4 h-4" />
                  ) : snap.connectionStatus === 'connected' ||
                    snap.connectionStatus === 'outgoing_pending' ? (
                    <UserCheck className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* External Share & Export Studio Controls */}
        <div className="w-full flex flex-col gap-3 px-1">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleToggleShareToChat}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer whitespace-nowrap ${
                  showChatPicker
                    ? 'bg-indigo-500 text-white'
                    : 'bg-[#0084FF] hover:bg-[#0073E6] text-white'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Share to DM / Group</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadPng()}
                disabled={downloading}
                className="min-h-[42px] px-4 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{downloading ? 'Exporting PNG...' : 'Download PNG Card'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="min-h-[42px] px-4 rounded-xl bg-white/12 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedLink ? (
                  <Check className="w-4 h-4 text-emerald-300" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleNativeShare()}
                aria-label="Share externally"
                className="min-h-[42px] px-3.5 rounded-xl bg-white/12 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
            </div>

            {actionNotice && (
              <p className="text-[11px] font-medium text-emerald-300 text-center sm:text-right">
                {actionNotice}
              </p>
            )}
          </div>

          {/* Interactive Active DM & Group Chat Picker */}
          {showChatPicker && isLoggedIn && (
            <div className="w-full rounded-2xl bg-slate-900/90 border border-white/20 backdrop-blur-xl p-4 space-y-3 text-white shadow-2xl animate-fadeIn">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle className="w-4 h-4 text-[#0084FF] shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold truncate">
                    Send ProfileShareCard to a DM or Group Chat
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChatPicker(false)}
                  aria-label="Close chat picker"
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-white/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Filter active DMs or group chats..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/45 outline-none focus:border-[#0084FF]"
                  />
                </div>
                <div className="inline-flex items-center p-1 rounded-xl bg-white/10 border border-white/15 gap-1 shrink-0">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'direct', label: 'DMs' },
                      { id: 'group', label: 'Groups' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setChatFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        chatFilter === tab.id
                          ? 'bg-white text-slate-900'
                          : 'text-white/75 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={chatNote}
                onChange={(e) => setChatNote(e.target.value)}
                maxLength={140}
                placeholder="Optional networking note (e.g. Happy to connect on clinical cases!)"
                className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/45 outline-none focus:border-[#0084FF]"
              />

              {chatPickerError && (
                <p className="text-xs text-rose-300 font-medium">{chatPickerError}</p>
              )}

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {loadingConversations ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-white/70">
                    <Loader2 className="w-4 h-4 animate-spin text-[#0084FF]" />
                    <span>Loading active DMs &amp; group chats...</span>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="py-5 text-center space-y-2">
                    <p className="text-xs text-white/70">
                      {conversations.length === 0
                        ? 'No active DMs or group chats yet. Open Messenger to start one.'
                        : 'No matching chats found.'}
                    </p>
                    {onOpenConversation && conversations.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenConversation('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold cursor-pointer"
                      >
                        Open Messenger
                      </button>
                    )}
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isGrp = conv.type === 'group' || conv.type === 'announcement';
                    const title = conv.title || conv.person.fullName;
                    const subtitle = isGrp
                      ? conv.person.profession || 'Group Chat'
                      : `Batch ${conv.person.batchYear} · ${conv.person.profession || 'SZMC Doctor'}`;
                    const alreadySent = Boolean(sentConvIds[conv.id]);
                    const isBusy = sendingConvId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isGrp ? (
                            <div className="w-9 h-9 rounded-full bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-indigo-200" />
                            </div>
                          ) : (
                            <img
                              src={conv.person.avatarUrl}
                              alt={title}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-white/25 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{title}</p>
                            <p className="text-[11px] text-white/65 truncate">{subtitle}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {alreadySent ? (
                            <>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                                <Check className="w-3.5 h-3.5" />
                                <span>Sent</span>
                              </span>
                              {onOpenConversation && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenConversation(conv.id);
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                >
                                  Open Chat
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSendCardToConversation(conv)}
                              disabled={Boolean(sendingConvId)}
                              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>Send Card</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
