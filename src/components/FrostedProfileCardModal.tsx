import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { AlumniProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  fetchSocialGraphSnapshot,
  getCachedSocialGraphSnapshot,
  sendConnectionRequest,
  subscribeSocialGraphChanges,
  toggleFollowUser,
  type SocialGraphSnapshot,
} from '../services/socialGraphService';
import {
  renderFrostedProfileCardImage,
  type FrostedCardTheme,
  type ProfileCardExportFormat,
  type ProfileCardStyleId,
} from '../utils/profileCardCanvas';
import { triggerBlobDownload } from '../utils/imageDownload';
import { FacebookIcon, WhatsAppIcon } from './SocialIcons';
import handHeldGlassBgUrl from '../assets/images/hand_held_glass_card_blank_1795371015384.jpg';

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

const CARD_STYLE_STORAGE_KEY = 'szmc_profile_card_style_v2';

const CARD_STYLES: Array<{
  id: ProfileCardStyleId;
  label: string;
}> = [
  { id: 'handheld', label: 'Hand-Held Glass' },
  { id: 'present', label: 'Present Frosted' },
];

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

function loadSavedCardStyle(): ProfileCardStyleId {
  if (typeof window === 'undefined') return 'handheld';
  try {
    const raw = localStorage.getItem(CARD_STYLE_STORAGE_KEY);
    if (raw === 'handheld' || raw === 'present') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'handheld';
}

// Reference coordinate box for the tilted acrylic glass card inside the 896x1200 hand photo
const HANDHELD_CARD_REF_W = 460;
const HANDHELD_CARD_REF_H = 384;

export const FrostedProfileCardModal: React.FC<FrostedProfileCardModalProps> = ({
  profile,
  isOpen,
  postsCountOverride,
  onClose,
  onStartMessage,
  onOpenFullProfile,
  onEditOwnProfile,
  onRequireLogin,
}) => {
  const { isLoggedIn, currentUser } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  const [cardStyle, setCardStyle] = useState<ProfileCardStyleId>(loadSavedCardStyle);
  const [theme, setTheme] = useState<FrostedCardTheme>('acrylic');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [handBgFailed, setHandBgFailed] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [copiedContact, setCopiedContact] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<ProfileCardExportFormat | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busySocialAction, setBusySocialAction] = useState<'follow' | 'connect' | null>(null);

  // Measure hand-held photo stage width so the tilted acrylic glass UI scales seamlessly on every viewport
  const handStageRef = useRef<HTMLDivElement | null>(null);
  const [handCardScale, setHandCardScale] = useState<number>(0.76);

  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [glarePos, setGlarePos] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 35,
    active: false,
  });
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snap, setSnap] = useState<SocialGraphSnapshot>({
    connectionStatus: 'none',
    connectionId: null,
    isFollowing: false,
    followersCount: 0,
    followingCount: 0,
    connectionsCount: 0,
  });

  const handleSelectStyle = (next: ProfileCardStyleId) => {
    setCardStyle(next);
    setTilt({ rx: 0, ry: 0 });
    try {
      localStorage.setItem(CARD_STYLE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!isOpen || cardStyle !== 'handheld') return;
    const el = handStageRef.current;
    if (!el) return;

    const updateScale = () => {
      const w = el.clientWidth;
      if (w > 0) {
        // Card spans 76.2% of the 896px-wide hand photo
        setHandCardScale((w * 0.762) / HANDHELD_CARD_REF_W);
      }
    };

    updateScale();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateScale);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isOpen, cardStyle]);

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
    setShowDownloadMenu(false);
    setActionNotice(null);
    setTilt({ rx: 0, ry: 0 });
  }, [profile?.id, isOpen]);

  useEffect(() => {
    if (!showDownloadMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showDownloadMenu]);

  const loadSnapshot = useCallback(async () => {
    if (!profile?.id) return;
    const viewerId = isLoggedIn ? currentUser.id : undefined;
    const cached = getCachedSocialGraphSnapshot(viewerId, profile.id);
    if (cached) {
      setSnap(cached);
    } else {
      setLoadingSnapshot(true);
    }
    try {
      const data = await fetchSocialGraphSnapshot(viewerId, profile.id);
      setSnap(data);
    } finally {
      setLoadingSnapshot(false);
    }
  }, [isLoggedIn, currentUser.id, profile?.id]);

  useEffect(() => {
    if (!isOpen || !profile?.id) return;
    void loadSnapshot();
    const unsubscribe = subscribeSocialGraphChanges((detail) => {
      if (detail.targetUserId === profile.id || detail.actorUserId === profile.id) {
        void loadSnapshot();
      }
    });
    return unsubscribe;
  }, [isOpen, profile?.id, loadSnapshot]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Push a lightweight history entry so browser / mobile hardware Back closes this card cleanly
    let pushedHistory = false;
    try {
      const currentState =
        window.history.state && typeof window.history.state === 'object'
          ? window.history.state
          : {};
      if (!currentState.szmcProfileCardOpen) {
        window.history.pushState({ ...currentState, szmcProfileCardOpen: true }, '');
        pushedHistory = true;
      }
    } catch {
      // Ignore history API restrictions in sandboxed frames
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const onPopState = () => {
      onCloseRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPopState);
      if (pushedHistory) {
        try {
          if (window.history.state?.szmcProfileCardOpen) {
            const { szmcProfileCardOpen: _ignored, ...rest } = window.history.state;
            window.history.replaceState(rest, '');
          }
        } catch {
          // Ignore history cleanup errors
        }
      }
    };
  }, [isOpen]);

  // Auto-dismiss transient confirmation notices after 4.5s
  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  if (!profile) return null;

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

  const roleSubtitle = [profile.position || profile.profession || 'SZMC Physician', profile.cadre]
    .filter(Boolean)
    .join(' · ');

  const handLine1 = profile.institution
    ? `${profile.institution}${profile.city ? `, ${profile.city}` : ''}`
    : 'Shaheed Ziaur Rahman Medical College, Bogura';

  const handLine2 =
    [
      profile.degree?.slice(0, 2).join(' • '),
      profile.specialty?.slice(0, 2).join(' • '),
    ]
      .filter(Boolean)
      .join(' • ') || 'MBBS • Clinical Practice • SZMC Alumni';

  const handLine3 =
    profile.bio?.replace(/\s+/g, ' ').trim() ||
    (profile.bloodGroup
      ? `Blood Group ${profile.bloodGroup} • Serving patients & alumni community`
      : 'Connecting SZMC physicians across 35 MBBS batches');

  const followButtonLabel = isMine
    ? 'Edit Profile'
    : snap.isFollowing
    ? 'Following'
    : 'Follow';

  const followButtonTitle = isMine
    ? 'Edit your alumni profile'
    : !isLoggedIn
    ? `Sign in to follow ${profile.fullName}`
    : snap.isFollowing
    ? `Tracking updates from ${profile.fullName} · Click to unfollow`
    : `Follow ${profile.fullName} to track their updates`;

  const renderFollowButtonContent = (compact = false) => {
    if (busySocialAction === 'follow') {
      return (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Loader2 className={compact ? 'w-3 h-3 animate-spin' : 'w-3.5 h-3.5 animate-spin'} />
          <span>{snap.isFollowing ? 'Following' : 'Follow'}</span>
        </span>
      );
    }
    if (isMine) return <span>Edit Profile</span>;
    if (snap.isFollowing) {
      return (
        <span className="inline-flex items-center justify-center gap-1">
          <Check className={compact ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} strokeWidth={2.6} />
          <span>Following</span>
        </span>
      );
    }
    return <span>{followButtonLabel}</span>;
  };

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

  const handleDownloadCard = async (format: ProfileCardExportFormat) => {
    if (downloadingFormat) return;
    setShowDownloadMenu(false);
    setDownloadingFormat(format);
    setActionNotice(null);
    try {
      const blob = await renderFrostedProfileCardImage({
        profile,
        metrics: {
          postsCount: effectivePostsCount,
          followersCount: snap.followersCount,
          followingCount: snap.followingCount,
        },
        shareUrl,
        theme,
        styleId: cardStyle,
        format,
      });
      const slug = profile.fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const ext = format === 'png' ? 'png' : 'jpg';
      triggerBlobDownload(blob, `szmc-${cardStyle}-card-${slug || profile.id}.${ext}`);
      setActionNotice(
        format === 'png'
          ? 'High-quality PNG card downloaded.'
          : 'High-quality JPG card downloaded.'
      );
    } catch {
      setActionNotice(`Could not export ${format.toUpperCase()} card. Please try again.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleFollowAction = async () => {
    if (isMine) {
      onClose();
      onEditOwnProfile?.();
      return;
    }
    const firstName = profile.fullName.split(' ')[0] || profile.fullName;
    if (!isLoggedIn || !currentUser.id) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        setActionNotice(`Sign in to follow ${firstName} and track their updates.`);
      }
      return;
    }
    if (busySocialAction === 'follow') return;

    const previousSnap = snap;
    const nextFollowing = !previousSnap.isFollowing;
    const optimisticFollowers = nextFollowing
      ? previousSnap.followersCount + 1
      : Math.max(0, previousSnap.followersCount - 1);

    // Optimistic UI update for immediate responsiveness
    setBusySocialAction('follow');
    setActionNotice(null);
    setSnap((prev) => ({
      ...prev,
      isFollowing: nextFollowing,
      followersCount: optimisticFollowers,
    }));

    try {
      const res = await toggleFollowUser(
        currentUser.id,
        profile.id,
        previousSnap.isFollowing,
        currentUser.fullName
      );
      if (res.success) {
        setSnap((prev) => ({
          ...prev,
          isFollowing: res.isFollowing,
          followersCount: Math.max(
            res.isFollowing ? 1 : 0,
            res.isFollowing
              ? previousSnap.followersCount + 1
              : Math.max(0, previousSnap.followersCount - 1)
          ),
        }));
        setActionNotice(
          res.isFollowing
            ? `Following ${firstName} — their updates will appear in your Following feed.`
            : `Unfollowed ${firstName}.`
        );
      } else {
        setSnap(previousSnap);
        setActionNotice(res.error || 'Could not update follow status. Please try again.');
      }
    } catch {
      setSnap(previousSnap);
      setActionNotice('Could not update follow status. Please try again.');
    } finally {
      setBusySocialAction(null);
    }
  };

  const handleConnectOrShareAction = async () => {
    if (isMine) {
      await handleDownloadCard('jpg');
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

  const renderContactDrawer = (lightSurface = false) => {
    if (!showContactDrawer) return null;
    return (
      <div
        className={`w-full p-3.5 rounded-2xl border space-y-1.5 text-xs animate-fadeIn ${
          lightSurface
            ? 'bg-slate-900/5 border-slate-300/70 text-slate-900'
            : 'bg-black/45 border-white/15 text-white backdrop-blur-xl'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">Direct Contact Details</span>
          <button
            type="button"
            onClick={() => setShowContactDrawer(false)}
            aria-label="Close contact details"
            className="opacity-65 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {profile.phone && (
          <p className="flex items-center gap-2 tabular-nums">
            <Phone className={`w-3.5 h-3.5 shrink-0 ${lightSurface ? 'text-emerald-700' : 'text-sky-300'}`} />
            <span>{profile.phone}</span>
          </p>
        )}
        {profile.email && (
          <p className="flex items-center gap-2 truncate">
            <Mail className={`w-3.5 h-3.5 shrink-0 ${lightSurface ? 'text-emerald-700' : 'text-sky-300'}`} />
            <span className="truncate">{profile.email}</span>
          </p>
        )}
        {!profile.phone && !profile.email && !whatsappDigits && (
          <p className="opacity-70">
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
            className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
              lightSurface
                ? 'text-emerald-800 hover:text-emerald-950'
                : 'text-sky-300 hover:text-sky-200'
            }`}
          >
            {copiedContact ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copiedContact ? 'Contact copied' : 'Copy contact info'}</span>
          </button>
        )}
      </div>
    );
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="frosted-profile-card-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.22, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-3 pt-4 pb-8 sm:p-5 bg-[#05070e]/92 backdrop-blur-md overflow-y-auto"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="frosted-card-title"
        >
          <motion.div
            key={`frosted-profile-card-dialog-${profile.id}`}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
            transition={{
              duration: prefersReducedMotion ? 0.12 : 0.28,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="w-full max-w-[600px] sm:my-auto flex flex-col items-center gap-3.5"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Top Back Button + Card Type Selector + Full Profile Link */}
        <div className="w-full flex flex-col gap-2 px-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Go back"
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div
              role="tablist"
              aria-label="Profile card style"
              className="flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {CARD_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  role="tab"
                  aria-selected={cardStyle === style.id}
                  onClick={() => handleSelectStyle(style.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80 ${
                    cardStyle === style.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  {style.label}
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
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80"
              >
                <span>Full Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-theme Lighting Selector (only when Present Frosted is active) */}
          {cardStyle === 'present' && (
            <div className="flex items-center justify-start">
              <div
                role="tablist"
                aria-label="Present Frosted lighting theme"
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/8 border border-white/12"
              >
                {(Object.keys(THEME_CONFIG) as FrostedCardTheme[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={theme === key}
                    onClick={() => setTheme(key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80 ${
                      theme === key
                        ? 'bg-white/90 text-slate-900'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {THEME_CONFIG[key].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active Profile Card Stage with subtle style-switch entrance */}
        <motion.div
          key={cardStyle}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.1 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full flex flex-col items-center"
        >
        {/* ================================================================
            TYPE 1: HAND-HELD GLASS (EXACT MATCH TO UPLOADED REFERENCE PHOTO)
           ================================================================ */}
        {cardStyle === 'handheld' && (
          <div className="w-full flex flex-col items-center gap-3">
            <div
              ref={handStageRef}
              onPointerMove={(e) => {
                if (e.pointerType !== 'mouse' || prefersReducedMotion) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const gx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
                const gy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
                setGlarePos({ x: gx, y: gy, active: true });
              }}
              onPointerLeave={() => setGlarePos((prev) => ({ ...prev, active: false }))}
              className="relative w-full max-w-[460px] aspect-[896/1200] rounded-[24px] overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.75)] ring-1 ring-white/15 bg-[#090c12] select-none"
            >
              {/* Photorealistic Hand Holding Blank Transparent Frosted Acrylic Card */}
              {!handBgFailed ? (
                <img
                  src={handHeldGlassBgUrl}
                  alt="Hand holding transparent frosted acrylic profile card"
                  referrerPolicy="no-referrer"
                  onError={() => setHandBgFailed(true)}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#0b0e16] via-[#171c28] to-[#0a0c12]" />
              )}

              {/* Pixel-aligned Tilted Frosted Acrylic Card Overlay */}
              <div
                style={{
                  left: '51.2%',
                  top: '46.7%',
                  width: `${HANDHELD_CARD_REF_W}px`,
                  height: `${HANDHELD_CARD_REF_H}px`,
                  transform: `translate(-50%, -50%) rotate(-5.6deg) scale(${handCardScale})`,
                  transformOrigin: 'center center',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)',
                }}
                className="absolute rounded-[22px] overflow-hidden text-white flex flex-col justify-between p-[22px] pt-[18px] pb-[18px]"
              >
                {/* Subtle optical readability veil + diagonal glass bevel sheen */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0d1018]/22 via-[#0d1018]/14 to-[#0d1018]/28"
                />
                <div
                  aria-hidden="true"
                  style={{
                    background: glarePos.active
                      ? `radial-gradient(240px circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.16), transparent 72%)`
                      : 'linear-gradient(128deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 38%, transparent 62%, rgba(255,255,255,0.06) 100%)',
                  }}
                  className="pointer-events-none absolute inset-0 transition-opacity duration-200"
                />

                {/* Top-Right Glowing White X Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close profile card"
                  className="absolute top-[10px] right-[12px] z-20 w-[34px] h-[34px] rounded-full text-white/95 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer drop-shadow-[0_0_8px_rgba(255,255,255,0.75)] focus-visible:outline-2 focus-visible:outline-white/80"
                >
                  <X className="w-[21px] h-[21px]" strokeWidth={2.4} />
                </button>

                {/* Top Row: Luminous Peach-to-Lavender Halo Avatar + Name & 3-Column Metrics */}
                <div className="relative z-10 flex items-center gap-[18px] pr-[28px] mt-[4px]">
                  <div
                    style={{
                      boxShadow:
                        '0 0 18px rgba(253, 214, 178, 0.62), 0 0 28px rgba(196, 181, 253, 0.52)',
                    }}
                    className="p-[2.5px] rounded-full bg-gradient-to-br from-[#fde2c4] via-[#f5b7d6] to-[#c4b5fd] shrink-0"
                  >
                    <div className="w-[90px] h-[90px] rounded-full overflow-hidden bg-slate-950 ring-[1.5px] ring-white/90 flex items-center justify-center">
                      {!avatarFailed && profile.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt={profile.fullName}
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[24px] font-extrabold text-white">
                          {initials || 'SZ'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2
                        id="frosted-card-title"
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.45)' }}
                        className="text-[13px] font-extrabold tracking-[0.015em] text-white uppercase truncate"
                      >
                        {profile.fullName} | {batchLabel}
                      </h2>
                      {profile.verificationStatus === 'verified' && (
                        <ShieldCheck className="w-[15px] h-[15px] text-sky-200 shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)]" />
                      )}
                    </div>

                    {/* 3-Column Left-Aligned Metrics (matching postingan / pengikut / mengikuti) */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p
                          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.42)' }}
                          className="text-[19px] font-extrabold leading-none tabular-nums text-white"
                        >
                          {effectivePostsCount.toLocaleString()}
                        </p>
                        <p
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                          className="text-[12.5px] text-white/90 font-normal mt-[3px] leading-tight"
                        >
                          posts
                        </p>
                      </div>
                      <div aria-live="polite">
                        <p
                          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.42)' }}
                          className="text-[19px] font-extrabold leading-none tabular-nums text-white"
                        >
                          {loadingSnapshot ? '—' : snap.followersCount.toLocaleString()}
                        </p>
                        <p
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                          className="text-[12.5px] text-white/90 font-normal mt-[3px] leading-tight"
                        >
                          followers
                        </p>
                      </div>
                      <div>
                        <p
                          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.42)' }}
                          className="text-[19px] font-extrabold leading-none tabular-nums text-white"
                        >
                          {snap.followingCount.toLocaleString()}
                        </p>
                        <p
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
                          className="text-[12.5px] text-white/90 font-normal mt-[3px] leading-tight"
                        >
                          following
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Middle Bio, Link & Socials (exact typography rhythm of the uploaded photo) */}
                <div
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.48)' }}
                  className="relative z-10 mt-[14px] space-y-[3px] text-[12.5px] leading-[1.36]"
                >
                  <p className="text-white/68 font-normal truncate">{roleSubtitle}</p>
                  <p className="text-white/95 font-normal truncate">🌐 {handLine1}</p>
                  <p className="text-white/95 font-normal truncate">🩺 {handLine2}</p>
                  <p className="text-white/95 font-normal truncate">💡 {handLine3}</p>

                  {/* Bold secondary action line (matches "Lihat terjemahan") */}
                  <div className="pt-[3px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenFullProfile) {
                          onClose();
                          onOpenFullProfile(profile.id);
                        }
                      }}
                      className="text-[12.5px] font-bold text-white hover:text-sky-200 transition-colors cursor-pointer"
                    >
                      {profile.verificationStatus === 'verified'
                        ? 'Verified SZMC Alumni Profile'
                        : 'View full alumni profile'}
                    </button>
                  </div>

                  {/* Social Contact Row (WhatsApp + Facebook icons matching reference) */}
                  <div className="pt-[4px] flex items-center gap-[16px] text-[12.5px] text-white/95">
                    {whatsappDigits ? (
                      <a
                        href={`https://wa.me/${whatsappDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-[6px] hover:text-white transition-colors"
                      >
                        <WhatsAppIcon className="w-[15px] h-[15px] shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowContactDrawer((prev) => !prev)}
                        className="inline-flex items-center gap-[6px] hover:text-white transition-colors cursor-pointer"
                      >
                        <WhatsAppIcon className="w-[15px] h-[15px] shrink-0" />
                        <span>WhatsApp</span>
                      </button>
                    )}

                    {fbUrl ? (
                      <a
                        href={fbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-[6px] hover:text-white transition-colors truncate"
                      >
                        <FacebookIcon className="w-[15px] h-[15px] shrink-0" />
                        <span className="truncate">
                          {profile.fullName.split(' ').slice(0, 2).join(' ')}
                        </span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-[6px] text-white/90 truncate">
                        <FacebookIcon className="w-[15px] h-[15px] shrink-0" />
                        <span className="truncate">
                          {profile.fullName.split(' ').slice(0, 2).join(' ')}
                          {profile.city ? ` · ${profile.city}` : ''}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom 4-Button Frosted Glass Strip (exact match: lavender Follow + 3 neutral glass) */}
                <div className="relative z-10 mt-auto pt-[10px] flex items-center gap-[8px]">
                  <button
                    type="button"
                    onClick={() => void handleFollowAction()}
                    disabled={busySocialAction === 'follow'}
                    aria-pressed={!isMine ? snap.isFollowing : undefined}
                    title={followButtonTitle}
                    className={`flex-1 h-[36px] px-2 rounded-[10px] border text-white font-semibold text-[13px] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                      !isMine && snap.isFollowing
                        ? 'bg-emerald-500/75 hover:bg-emerald-500/90 border-emerald-200/45 shadow-[0_4px_14px_rgba(16,185,129,0.28)]'
                        : 'bg-[#898ee0]/80 hover:bg-[#898ee0]/95 border-white/35 shadow-[0_4px_14px_rgba(99,102,241,0.28)]'
                    }`}
                  >
                    {renderFollowButtonContent(true)}
                  </button>

                  <button
                    type="button"
                    onClick={handleMessageAction}
                    disabled={isMine && !onStartMessage}
                    className="flex-1 h-[36px] px-2 rounded-[10px] bg-white/[0.17] hover:bg-white/[0.28] border border-white/32 text-white font-medium text-[13px] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    Message
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowContactDrawer((prev) => !prev)}
                    className={`flex-1 h-[36px] px-2 rounded-[10px] border text-white font-medium text-[13px] transition-colors whitespace-nowrap cursor-pointer ${
                      showContactDrawer
                        ? 'bg-white/32 border-white/50'
                        : 'bg-white/[0.17] hover:bg-white/[0.28] border-white/32'
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
                        ? 'Download high-quality JPG card'
                        : snap.connectionStatus === 'connected'
                        ? 'Connected'
                        : snap.connectionStatus === 'outgoing_pending'
                        ? 'Request pending'
                        : 'Connect'
                    }
                    aria-label={isMine ? 'Download high-quality JPG card' : 'Connect'}
                    className="w-[38px] h-[36px] rounded-[10px] bg-white/[0.17] hover:bg-white/[0.28] border border-white/32 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                  >
                    {isMine ? (
                      <Download className="w-[15px] h-[15px]" />
                    ) : snap.connectionStatus === 'connected' ||
                      snap.connectionStatus === 'outgoing_pending' ? (
                      <UserCheck className="w-[15px] h-[15px]" />
                    ) : (
                      <UserPlus className="w-[15px] h-[15px]" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Contact Drawer renders cleanly below the Hand-Held photo so it never crowds the tilted glass */}
            <div className="w-full max-w-[460px]">{renderContactDrawer(false)}</div>
          </div>
        )}

        {/* ================================================================
            TYPE 2: PRESENT FROSTED (ORIGINAL STUDIO CARD PRESERVED INTACT)
           ================================================================ */}
        {cardStyle === 'present' && (
          <div
            className="relative w-full py-3 sm:py-5 px-1 sm:px-3 flex items-center justify-center"
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

            <div
              style={{
                transform: `perspective(1100px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
              }}
              className="relative w-full rounded-[26px] bg-white/[0.09] backdrop-blur-2xl border border-white/30 shadow-[0_24px_70px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.45)] p-5 sm:p-7 text-white transition-transform duration-200 ease-out overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-white/5 opacity-80" />

              <button
                type="button"
                onClick={onClose}
                aria-label="Close profile card"
                className="absolute top-3.5 right-3.5 z-10 min-w-[40px] min-h-[40px] rounded-full text-white/80 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 space-y-4">
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

                    <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-[300px]">
                      <div>
                        <p className="text-lg sm:text-xl font-extrabold leading-tight tabular-nums text-white">
                          {effectivePostsCount.toLocaleString()}
                        </p>
                        <p className="text-[11px] sm:text-xs text-white/75 font-medium">posts</p>
                      </div>
                      <div aria-live="polite">
                        <p className="text-lg sm:text-xl font-extrabold leading-tight tabular-nums text-white">
                          {loadingSnapshot ? '—' : snap.followersCount.toLocaleString()}
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

                <div className="space-y-1.5 text-xs sm:text-[13px]">
                  <p className="text-white/65 font-semibold">{roleSubtitle}</p>

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

                {renderContactDrawer(false)}

                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleFollowAction()}
                    disabled={busySocialAction === 'follow'}
                    aria-pressed={!isMine ? snap.isFollowing : undefined}
                    title={followButtonTitle}
                    className={`flex-1 min-h-[42px] px-3 rounded-xl font-bold text-xs border shadow-sm transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                      !isMine && snap.isFollowing
                        ? 'bg-emerald-500/80 hover:bg-emerald-500/95 border-emerald-200/40 text-white'
                        : `border-white/25 ${palette.primaryBtn}`
                    }`}
                  >
                    {renderFollowButtonContent()}
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
                        ? 'Download high-quality JPG card'
                        : snap.connectionStatus === 'connected'
                        ? 'Connected'
                        : snap.connectionStatus === 'outgoing_pending'
                        ? 'Request pending'
                        : 'Connect'
                    }
                    aria-label={isMine ? 'Download high-quality JPG card' : 'Connect'}
                    className="w-11 min-h-[42px] rounded-xl bg-white/16 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                  >
                    {isMine ? (
                      <Download className="w-4 h-4" />
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
        )}
        </motion.div>

        {/* High-Quality Card Download Control (JPG & PNG) */}
        <div className="w-full flex flex-col gap-3 px-1">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div ref={downloadMenuRef} className="relative flex items-center justify-center sm:justify-start w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowDownloadMenu((prev) => !prev)}
                disabled={Boolean(downloadingFormat)}
                aria-haspopup="menu"
                aria-expanded={showDownloadMenu}
                className="min-h-[44px] px-5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {downloadingFormat ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {downloadingFormat
                    ? `Exporting ${downloadingFormat.toUpperCase()}...`
                    : 'Download Card (JPG / PNG)'}
                </span>
                {!downloadingFormat && (
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                      showDownloadMenu ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {showDownloadMenu && !downloadingFormat && (
                <div
                  role="menu"
                  aria-label="Choose card image format"
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 z-30 w-64 rounded-2xl bg-slate-950/95 border border-white/20 backdrop-blur-xl p-1.5 shadow-2xl space-y-1 animate-fadeIn"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleDownloadCard('jpg')}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-white/12 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">High-Quality JPG</p>
                      <p className="text-[11px] text-white/65">Ultra HD · Best for sharing</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-extrabold uppercase">
                      JPG
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleDownloadCard('png')}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left hover:bg-white/12 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">High-Quality PNG</p>
                      <p className="text-[11px] text-white/65">Ultra HD · Lossless quality</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase">
                      PNG
                    </span>
                  </button>
                </div>
              )}
            </div>

            {actionNotice && (
              <p
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 text-center sm:text-right"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{actionNotice}</span>
              </p>
            )}
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
};
