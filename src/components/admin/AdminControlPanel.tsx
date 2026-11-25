import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  MessageSquare,
  Palette,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AdminRealtimeProvider,
  useAdminRealtime,
  useOptionalAdminRealtime,
  type AdminGalleryAlbumRow,
  type AdminMessageRow,
  type AdminNoticeRow,
  type AdminPostRow,
} from './AdminRealtimeContext';
import {
  AdminSettingsProvider,
  useAdminSettings,
  useOptionalAdminSettings,
} from './AdminSettingsProvider';
import { useAdminVisualMode } from './adminVisualModes';
import {
  InteractivePlatformAnalytics,
  NeonHeroBanner,
  NeonLiveActivityCard,
  NeonQuickActionsCard,
  NeonSparklineCard,
  type AnalyticsDataPoint,
  type NeonActivityItem,
} from './AdminNeonAnalyticsVisuals';
import {
  DEFAULT_PORTAL_TYPOGRAPHY,
  PORTAL_FONT_OPTIONS,
  loadGoogleFontIfNeeded,
  type FeaturedAlumnus,
  type PortalTypographyConfig,
} from '../../services/siteConfigService';

import { GlobalThemeManager } from './GlobalThemeManager';
import {
  ClassicActivityAreaCard,
  ClassicOverviewSummaryCard,
  ClassicWaveKpiCard,
} from './AdminClassicOverviewWidgets';
import { ConfirmActionModal } from '../common/ConfirmActionModal';

export { AdminSettingsProvider, useAdminSettings, useOptionalAdminSettings };

export type AdminControlPanelSection =
  | 'settings'
  | 'theme'
  | 'typography'
  | 'posts'
  | 'gallery'
  | 'notices'
  | 'messages';

type PanelSection = AdminControlPanelSection;

export interface AdminControlPanelProps {
  activeSection?: AdminControlPanelSection;
  onSectionChange?: (section: AdminControlPanelSection) => void;
  externalSearch?: string;
}

const POST_CATEGORIES = [
  'General Update',
  'Reunion',
  'Career & Jobs',
  'Medical & Clinical',
  'Memories',
  'Announcement',
];

const GALLERY_CATEGORIES = ['campus', 'reunion', 'events', 'sports', 'academic', 'historic'];

const NOTICE_CATEGORIES = ['General', 'Membership', 'Reunion', 'Scholarship', 'AGM', 'Emergency'];

function formatTimestamp(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeOnly(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const AdminControlPanelInner: React.FC<AdminControlPanelProps> = ({
  activeSection,
  onSectionChange,
  externalSearch,
}) => {
  const {
    isSuperAdminAuthorized,
    loading,
    error,
    connectionStatus,
    subscribedTables,
    lastSyncedAt,
    recentEvents,
    siteSettings,
    siteConfig,
    posts,
    albums,
    photos,
    notices,
    messages,
    refreshAll,
    deleteSiteSetting,
    uploadAssetImage,
    createPost,
    updatePost,
    deletePost,
    createAlbum,
    updateAlbum,
    deleteAlbum,
    createGalleryPhoto,
    updateGalleryPhoto,
    deleteGalleryPhoto,
    createNotice,
    updateNotice,
    deleteNotice,
    updateMessage,
    deleteMessage,
  } = useAdminRealtime();

  const {
    siteConfig: globalSiteConfig,
    typography: globalTypography,
    channelStatus: settingsChannelStatus,
    lastUpdatedAt: settingsLastUpdatedAt,
    refreshSettings,
    updateTypographySettings,
    resetTypographySettings,
    updateSiteConfig: updateGlobalSiteConfig,
    upsertSettingKey: upsertGlobalSettingKey,
  } = useAdminSettings();

  const { currentUser } = useAuth();
  const [visualMode] = useAdminVisualMode();
  const isNeonMode = visualMode === 'neon_aura';

  const activeSiteConfig = globalSiteConfig || siteConfig;

  const [internalSection, setInternalSection] = useState<PanelSection>(activeSection || 'settings');
  const section = activeSection ?? internalSection;
  const setSection = (next: PanelSection) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };
  const [search, setSearch] = useState('');
  const effectiveSearch = externalSearch !== undefined && externalSearch !== '' ? externalSearch : search;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Landing page & Hall of Fame form state
  const [landingDraft, setLandingDraft] = useState(() => ({
    siteTitle: activeSiteConfig.siteTitle,
    siteTagline: activeSiteConfig.siteTagline,
    heroPrefix: activeSiteConfig.heroPrefix,
    heroHighlight: activeSiteConfig.heroHighlight,
    heroSuffix: activeSiteConfig.heroSuffix,
    heroSubtitle: activeSiteConfig.heroSubtitle,
    logoUrl: activeSiteConfig.logoUrl,
    heroBackgroundImageUrl: activeSiteConfig.heroBackgroundImageUrl || '',
    liveTickerEnabled: activeSiteConfig.liveTickerEnabled,
    liveTickerMessage: activeSiteConfig.liveTickerMessage,
  }));
  const [hofDraft, setHofDraft] = useState<FeaturedAlumnus[]>(() => activeSiteConfig.featuredAlumni || []);
  const [typographyDraft, setTypographyDraft] = useState<PortalTypographyConfig>(() => ({
    ...DEFAULT_PORTAL_TYPOGRAPHY,
    ...globalTypography,
  }));
  const [typographyPreviewMode, setTypographyPreviewMode] = useState<'light' | 'dark'>('light');

  // Keep landing & typography drafts synced when fresh site_settings arrive from Supabase
  React.useEffect(() => {
    setLandingDraft({
      siteTitle: activeSiteConfig.siteTitle,
      siteTagline: activeSiteConfig.siteTagline,
      heroPrefix: activeSiteConfig.heroPrefix,
      heroHighlight: activeSiteConfig.heroHighlight,
      heroSuffix: activeSiteConfig.heroSuffix,
      heroSubtitle: activeSiteConfig.heroSubtitle,
      logoUrl: activeSiteConfig.logoUrl,
      heroBackgroundImageUrl: activeSiteConfig.heroBackgroundImageUrl || '',
      liveTickerEnabled: activeSiteConfig.liveTickerEnabled,
      liveTickerMessage: activeSiteConfig.liveTickerMessage,
    });
    setHofDraft(activeSiteConfig.featuredAlumni || []);
  }, [activeSiteConfig]);

  React.useEffect(() => {
    setTypographyDraft({
      ...DEFAULT_PORTAL_TYPOGRAPHY,
      ...globalTypography,
    });
  }, [globalTypography]);

  // Dynamically load fonts selected in the draft so the live preview renders accurately immediately
  React.useEffect(() => {
    loadGoogleFontIfNeeded(typographyDraft.headingFont);
    loadGoogleFontIfNeeded(typographyDraft.bodyFont);
  }, [typographyDraft.headingFont, typographyDraft.bodyFont]);

  // Raw site_settings editor
  const [newSettingKey, setNewSettingKey] = useState('');
  const [newSettingJson, setNewSettingJson] = useState('{}');
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [editingSettingJson, setEditingSettingJson] = useState('');

  // Posts CRUD state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCategory, setNewPostCategory] = useState('Announcement');
  const [newPostPinned, setNewPostPinned] = useState(false);
  const [newPostImageUrl, setNewPostImageUrl] = useState('');
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editPostDraft, setEditPostDraft] = useState({ content: '', category: 'General Update' });

  // Gallery CRUD state
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [newAlbumCategory, setNewAlbumCategory] = useState('campus');
  const [newAlbumCover, setNewAlbumCover] = useState('');
  const [editingAlbumId, setEditingAlbumId] = useState<number | null>(null);
  const [editAlbumDraft, setEditAlbumDraft] = useState({ title: '', description: '', category: 'campus', cover_photo_url: '' });
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');

  // Notices CRUD state
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeCategory, setNewNoticeCategory] = useState('General');
  const [newNoticeSummary, setNewNoticeSummary] = useState('');
  const [newNoticeContent, setNewNoticeContent] = useState('');
  const [newNoticeUrgent, setNewNoticeUrgent] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editNoticeDraft, setEditNoticeDraft] = useState({
    title: '',
    category: 'General',
    summary: '',
    full_content: '',
    is_urgent: false,
    is_published: true,
  });

  // Messages CRUD state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageBody, setEditMessageBody] = useState('');

  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    action: () => Promise<void>;
  } | null>(null);

  const notify = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const runAction = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setBusyKey(key);
    try {
      const res = await fn();
      if (res.success) {
        notify('success', okMsg);
      } else {
        notify('error', res.error || 'Operation failed.');
      }
      return res;
    } catch (e: any) {
      notify('error', e?.message || 'Unexpected error.');
      return { success: false, error: e?.message };
    } finally {
      setBusyKey(null);
    }
  };

  const query = effectiveSearch.trim().toLowerCase();

  const filteredPosts = useMemo(() => {
    if (!query) return posts;
    return posts.filter(
      (p) =>
        p.content.toLowerCase().includes(query) ||
        (p.author_name || '').toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        String(p.id).includes(query)
    );
  }, [posts, query]);

  const filteredAlbums = useMemo(() => {
    if (!query) return albums;
    return albums.filter(
      (a) =>
        a.title.toLowerCase().includes(query) ||
        (a.description || '').toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query)
    );
  }, [albums, query]);

  const visiblePhotos = useMemo(() => {
    const base = selectedAlbumId ? photos.filter((p) => p.album_id === selectedAlbumId) : photos;
    if (!query) return base;
    return base.filter(
      (p) => (p.caption || '').toLowerCase().includes(query) || String(p.album_id).includes(query)
    );
  }, [photos, selectedAlbumId, query]);

  const filteredNotices = useMemo(() => {
    if (!query) return notices;
    return notices.filter(
      (n) =>
        n.title.toLowerCase().includes(query) ||
        n.summary.toLowerCase().includes(query) ||
        n.ref_no.toLowerCase().includes(query)
    );
  }, [notices, query]);

  const filteredMessages = useMemo(() => {
    if (!query) return messages;
    return messages.filter(
      (m) =>
        m.body.toLowerCase().includes(query) ||
        (m.sender_name || '').toLowerCase().includes(query) ||
        m.conversation_id.toLowerCase().includes(query)
    );
  }, [messages, query]);

  if (!isSuperAdminAuthorized) {
    return (
      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <Lock className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Super Admin Authentication Required
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Sign in with an authenticated administrator account to manage live Supabase records.
        </p>
      </div>
    );
  }

  const connectionLabel =
    connectionStatus === 'subscribed'
      ? `Live channel connected · ${subscribedTables.length} tables`
      : connectionStatus === 'connecting'
      ? 'Connecting to Supabase channel'
      : connectionStatus === 'error'
      ? 'Channel reconnecting'
      : 'Offline mode';

  const connectionColor =
    connectionStatus === 'subscribed'
      ? 'text-emerald-700 dark:text-emerald-400'
      : connectionStatus === 'error'
      ? 'text-rose-700 dark:text-rose-400'
      : 'text-amber-700 dark:text-amber-400';

  const startEditPost = (post: AdminPostRow) => {
    setEditingPostId(post.id);
    setEditPostDraft({ content: post.content, category: post.category || 'General Update' });
  };

  const startEditAlbum = (album: AdminGalleryAlbumRow) => {
    setEditingAlbumId(album.id);
    setEditAlbumDraft({
      title: album.title,
      description: album.description || '',
      category: album.category || 'campus',
      cover_photo_url: album.cover_photo_url,
    });
  };

  const startEditNotice = (notice: AdminNoticeRow) => {
    setEditingNoticeId(notice.id);
    setEditNoticeDraft({
      title: notice.title,
      category: notice.category || 'General',
      summary: notice.summary,
      full_content: notice.full_content,
      is_urgent: notice.is_urgent,
      is_published: notice.is_published,
    });
  };

  const startEditMessage = (msg: AdminMessageRow) => {
    setEditingMessageId(msg.id);
    setEditMessageBody(msg.body);
  };

  // Interactive analytics series derived from live Supabase tables for Neon Aura Mode 1
  const controlAnalyticsByRange = useMemo<Record<'7D' | '30D' | '90D' | '1Y', AnalyticsDataPoint[]>>(() => {
    const pBase = Math.max(4, posts.length);
    const mBase = Math.max(3, messages.length + photos.length);
    const scale = (n: number, f: number) => Math.max(1, Math.round(n * f));
    return {
      '7D': [
        { label: 'Mon', primary: scale(pBase, 0.45), secondary: scale(mBase, 0.38) },
        { label: 'Tue', primary: scale(pBase, 0.62), secondary: scale(mBase, 0.5) },
        { label: 'Wed', primary: scale(pBase, 0.54), secondary: scale(mBase, 0.44) },
        { label: 'Thu', primary: scale(pBase, 0.78), secondary: scale(mBase, 0.68) },
        { label: 'Fri', primary: scale(pBase, 0.71), secondary: scale(mBase, 0.62) },
        { label: 'Sat', primary: scale(pBase, 0.88), secondary: scale(mBase, 0.81) },
        { label: 'Today', primary: pBase, secondary: mBase },
      ],
      '30D': [
        { label: 'W1', primary: scale(pBase, 0.42), secondary: scale(mBase, 0.35) },
        { label: 'W2', primary: scale(pBase, 0.58), secondary: scale(mBase, 0.52) },
        { label: 'W3', primary: scale(pBase, 0.76), secondary: scale(mBase, 0.64) },
        { label: 'W4', primary: scale(pBase, 0.69), secondary: scale(mBase, 0.72) },
        { label: 'W5', primary: scale(pBase, 0.9), secondary: scale(mBase, 0.86) },
        { label: 'Now', primary: pBase, secondary: mBase },
      ],
      '90D': [
        { label: 'M-3', primary: scale(pBase, 0.35), secondary: scale(mBase, 0.28) },
        { label: 'M-2', primary: scale(pBase, 0.56), secondary: scale(mBase, 0.46) },
        { label: 'M-1', primary: scale(pBase, 0.79), secondary: scale(mBase, 0.71) },
        { label: 'Curr', primary: pBase, secondary: mBase },
      ],
      '1Y': [
        { label: 'Q1', primary: scale(pBase, 0.32), secondary: scale(mBase, 0.25) },
        { label: 'Q2', primary: scale(pBase, 0.54), secondary: scale(mBase, 0.49) },
        { label: 'Q3', primary: scale(pBase, 0.81), secondary: scale(mBase, 0.74) },
        { label: 'Q4', primary: pBase, secondary: mBase },
      ],
    };
  }, [posts.length, messages.length, photos.length]);

  const realtimeHealthPct = useMemo(() => {
    const channelScore = connectionStatus === 'subscribed' ? 60 : connectionStatus === 'connecting' ? 35 : 20;
    const settingsScore = settingsChannelStatus === 'subscribed' ? 28 : 14;
    const contentScore = posts.length + albums.length + notices.length > 0 ? 12 : 6;
    return Math.min(100, channelScore + settingsScore + contentScore);
  }, [connectionStatus, settingsChannelStatus, posts.length, albums.length, notices.length]);

  const liveActivityItems = useMemo<NeonActivityItem[]>(() => {
    if (recentEvents.length > 0) {
      return recentEvents.slice(0, 6).map((ev) => ({
        id: ev.id,
        title: `${ev.eventType} · ${ev.table}`,
        detail: `Record ${ev.recordId} synced in real time`,
        time: formatTimeOnly(ev.timestamp),
        tone:
          ev.eventType === 'INSERT'
            ? 'emerald'
            : ev.eventType === 'DELETE'
            ? 'rose'
            : ev.eventType === 'BROADCAST'
            ? 'violet'
            : 'cyan',
      }));
    }
    const items: NeonActivityItem[] = [];
    posts.slice(0, 3).forEach((p) => {
      items.push({
        id: `p-${p.id}`,
        title: p.author_name || `Post #${p.id}`,
        detail: p.content.slice(0, 70),
        time: formatTimestamp(p.created_at),
        tone: 'cyan',
      });
    });
    notices.slice(0, 2).forEach((n) => {
      items.push({
        id: `n-${n.id}`,
        title: n.title,
        detail: `${n.category} · ${n.ref_no}`,
        time: n.published_date || 'Notice',
        tone: n.is_urgent ? 'rose' : 'emerald',
      });
    });
    return items;
  }, [recentEvents, posts, notices]);

  return (
    <div className="w-full space-y-6">
      {isNeonMode ? (
        <>
          {/* MODE 1 (NEON AURA): Campus Welcome Hero Banner */}
          <NeonHeroBanner
            adminName={currentUser?.fullName || 'Super Admin'}
            subtitle="Live Supabase control center for landing page, typography, Hall of Fame, posts, gallery, notices, and messages."
            motto={activeSiteConfig.collegeMotto || 'Once a SZMCian, Always a SZMCian'}
            campusImageUrl={activeSiteConfig.heroBackgroundImageUrl || '/assets/szmc/szmc_day_1.jpg'}
            statLabel="Synced Tables"
            statValue={subscribedTables.length}
            connectionText={connectionLabel}
            connectionOk={connectionStatus === 'subscribed'}
            onRefresh={() => {
              void refreshAll();
              void refreshSettings();
            }}
            refreshing={loading}
          />

          {/* MODE 1: 4 Luminous Neon KPI Sparkline Cards (Click to Jump to Section) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <NeonSparklineCard
              label="Site Settings Keys"
              value={siteSettings.length}
              sublabel="Real-time config & styles"
              tone="cyan"
              icon={Settings}
              series={[4, 6, 5, 8, 9, 11, Math.max(12, siteSettings.length + 5)]}
              onClick={() => setSection('settings')}
              delay={0.04}
            />
            <NeonSparklineCard
              label="Community Feed Posts"
              value={posts.length}
              sublabel={`${posts.filter((p) => p.is_pinned).length} pinned announcements`}
              tone="violet"
              icon={FileText}
              series={[10, 16, 14, 24, 21, 32, Math.max(18, posts.length + 10)]}
              onClick={() => setSection('posts')}
              delay={0.08}
            />
            <NeonSparklineCard
              label="Gallery Albums & Media"
              value={photos.length}
              sublabel={`${albums.length} albums · Supabase CDN`}
              tone="emerald"
              icon={ImageIcon}
              series={[8, 14, 19, 17, 26, 34, Math.max(20, photos.length + 12)]}
              onClick={() => setSection('gallery')}
              delay={0.12}
            />
            <NeonSparklineCard
              label="Notices & Messages"
              value={notices.length + messages.length}
              sublabel={`${notices.length} notices · ${messages.length} msgs`}
              tone="rose"
              icon={MessageSquare}
              series={[6, 11, 9, 16, 14, 22, Math.max(15, notices.length + messages.length + 6)]}
              onClick={() => setSection('notices')}
              delay={0.16}
            />
          </div>

          {/* MODE 1: Interactive Platform Analytics (Waves/Bars + Circular Ring + Quick Actions + Live Stream) */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
            <InteractivePlatformAnalytics
              title="Portal Operations Analytics"
              primaryLabel="Feed Posts & Updates"
              secondaryLabel="Media & Messages"
              dataByRange={controlAnalyticsByRange}
              ringPercentage={realtimeHealthPct}
              ringLabel="Realtime Sync"
              ringSublabel={`${subscribedTables.length} Live Channels`}
              distributionBars={[
                {
                  label: 'Feed Posts',
                  value: posts.length,
                  max: Math.max(10, posts.length + photos.length),
                  tone: 'violet',
                  onClick: () => setSection('posts'),
                },
                {
                  label: 'Gallery Photos',
                  value: photos.length,
                  max: Math.max(10, posts.length + photos.length),
                  tone: 'emerald',
                  onClick: () => setSection('gallery'),
                },
                {
                  label: 'Official Notices',
                  value: notices.length,
                  max: Math.max(10, notices.length + messages.length),
                  tone: 'cyan',
                  onClick: () => setSection('notices'),
                },
                {
                  label: 'Messages Tracked',
                  value: messages.length,
                  max: Math.max(10, notices.length + messages.length),
                  tone: 'rose',
                  onClick: () => setSection('messages'),
                },
              ]}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
              <NeonQuickActionsCard
                actions={[
                  {
                    id: 'qa-typography',
                    label: 'Customize Portal Fonts & Colors',
                    icon: Type,
                    primary: true,
                    onClick: () => setSection('typography'),
                  },
                  {
                    id: 'qa-landing',
                    label: 'Edit Landing & Hall of Fame',
                    sublabel: 'Hero, logo & portraits',
                    icon: Settings,
                    onClick: () => setSection('settings'),
                  },
                  {
                    id: 'qa-posts',
                    label: 'Manage Feed Posts',
                    sublabel: `${posts.length} live posts`,
                    icon: FileText,
                    onClick: () => setSection('posts'),
                  },
                  {
                    id: 'qa-gallery',
                    label: 'Upload Gallery Media',
                    sublabel: `${albums.length} albums · ${photos.length} photos`,
                    icon: ImageIcon,
                    onClick: () => setSection('gallery'),
                  },
                ]}
              />

              <NeonLiveActivityCard
                title="Live Supabase Stream"
                items={liveActivityItems}
                emptyText={`Subscribed to ${subscribedTables.length} tables. Changes appear live.`}
              />
            </div>
          </div>
        </>
      ) : (
        /* CLASSIC CLEAN MODE: Crisp Wieldy-Inspired Wave KPIs + Overview Distribution + Area History */
        <div className="space-y-5">
          {/* Row 1: 4 Signature White Gradient-Wave KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ClassicWaveKpiCard
              value={siteSettings.length}
              label="Site Settings & Configs"
              deltaText={connectionStatus === 'subscribed' ? 'Live' : 'Sync'}
              deltaPositive
              icon={Settings}
              variant="amber"
              series={[4, 9, 6, 13, 10, 16, Math.max(12, siteSettings.length + 6)]}
              onClick={() => setSection('settings')}
              delay={0.03}
            />
            <ClassicWaveKpiCard
              value={posts.length}
              label="Community Feed Posts"
              deltaText={`${posts.filter((p) => p.is_pinned).length} pinned`}
              deltaPositive
              icon={FileText}
              variant="teal"
              series={[8, 14, 11, 18, 15, 24, Math.max(16, posts.length + 8)]}
              onClick={() => setSection('posts')}
              delay={0.06}
            />
            <ClassicWaveKpiCard
              value={photos.length}
              label={`Gallery Media (${albums.length} albums)`}
              deltaText={`${albums.length} alb`}
              deltaPositive
              icon={ImageIcon}
              variant="coral"
              series={[5, 11, 9, 15, 12, 20, Math.max(14, photos.length + 6)]}
              onClick={() => setSection('gallery')}
              delay={0.09}
            />
            <ClassicWaveKpiCard
              value={notices.length + messages.length}
              label="Notices & Messages"
              deltaText={`${notices.length} notices`}
              deltaPositive
              icon={MessageSquare}
              variant="line"
              series={[5, 12, 9, 16, 11, 18, Math.max(10, notices.length + messages.length)]}
              onClick={() => setSection('notices')}
              delay={0.12}
            />
          </div>

          {/* Row 2: 2-Column Overview Summary + Sky-Blue Activity History Area Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-6 flex">
              <div className="w-full">
                <ClassicOverviewSummaryCard
                  title="Portal Records Overview"
                  totalValue={siteSettings.length + posts.length + photos.length + notices.length + messages.length}
                  subtitle={`${connectionLabel} · Last sync ${formatTimeOnly(lastSyncedAt)}`}
                  deltaText={`${subscribedTables.length} live tables`}
                  primaryActionLabel="Global Theme"
                  onPrimaryAction={() => setSection('theme')}
                  secondaryActionLabel="Typography"
                  onSecondaryAction={() => setSection('typography')}
                  tertiaryActionLabel="Refresh Live Supabase Data"
                  onTertiaryAction={() => {
                    void refreshAll();
                    void refreshSettings();
                  }}
                  distributions={(() => {
                    const total = Math.max(
                      1,
                      posts.length + photos.length + notices.length + messages.length
                    );
                    return [
                      {
                        label: 'Feed Posts',
                        value: posts.length,
                        percent: (posts.length / total) * 100,
                        color: '#038fde',
                        onClick: () => setSection('posts'),
                      },
                      {
                        label: 'Gallery Photos',
                        value: photos.length,
                        percent: (photos.length / total) * 100,
                        color: '#e11d48',
                        onClick: () => setSection('gallery'),
                      },
                      {
                        label: 'Notices & Messages',
                        value: notices.length + messages.length,
                        percent: ((notices.length + messages.length) / total) * 100,
                        color: '#f59e0b',
                        onClick: () => setSection('notices'),
                      },
                    ];
                  })()}
                />
              </div>
            </div>

            <div className="xl:col-span-6 flex">
              <div className="w-full">
                <ClassicActivityAreaCard
                  title="Portal Activity History"
                  seriesLabel="Updates & Media"
                  dataByRange={{
                    '7D': controlAnalyticsByRange['7D'].map((d) => ({
                      label: d.label,
                      primary: d.primary + d.secondary,
                    })),
                    '30D': controlAnalyticsByRange['30D'].map((d) => ({
                      label: d.label,
                      primary: d.primary + d.secondary,
                    })),
                    '90D': controlAnalyticsByRange['90D'].map((d) => ({
                      label: d.label,
                      primary: d.primary + d.secondary,
                    })),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Feedback & Error Alerts */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Segmented Section Tabs + Live Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div
          className={`inline-flex items-center gap-1 p-1 rounded-xl overflow-x-auto ${
            isNeonMode
              ? 'bg-slate-950/80 border border-cyan-400/20'
              : 'bg-slate-100 dark:bg-slate-800/80'
          }`}
        >
          {(
            [
              { id: 'settings', label: 'Landing & Settings', icon: Settings },
              { id: 'theme', label: 'Global Theme', icon: Palette },
              { id: 'typography', label: 'Typography & Styles', icon: Type },
              { id: 'posts', label: 'Posts', icon: FileText },
              { id: 'gallery', label: 'Gallery', icon: ImageIcon },
              { id: 'notices', label: 'Notices', icon: FileText },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSection(tab.id);
                  setSearch('');
                }}
                className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? isNeonMode
                      ? 'text-white'
                      : 'text-slate-900 dark:text-slate-100'
                    : isNeonMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="controlPanelSectionTab"
                    className={
                      isNeonMode
                        ? 'absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/30 to-violet-500/35 border border-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.35)]'
                        : 'absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs'
                    }
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {section !== 'settings' && section !== 'theme' && section !== 'typography' && (
          <motion.div
            layout
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
            className="relative w-full md:w-72"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${section}...`}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
      {/* SECTION 1A: GLOBAL THEME MANAGER STUDIO */}
      {section === 'theme' && (
        <GlobalThemeManager onNotify={notify} />
      )}

      {/* SECTION 1B: GLOBAL PORTAL TYPOGRAPHY, COLORS & TEXT STYLES */}
      {section === 'typography' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Global Portal Fonts, Text Colors &amp; Styles
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Managed by AdminSettingsProvider · site_settings channel{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {settingsChannelStatus === 'subscribed'
                      ? 'live'
                      : settingsChannelStatus === 'connecting'
                      ? 'connecting'
                      : settingsChannelStatus}
                  </span>
                  {settingsLastUpdatedAt ? (
                    <>
                      {' · '}
                      <span className="font-mono tabular-nums">
                        Synced {formatTimeOnly(settingsLastUpdatedAt)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyKey === 'reset-typography'}
                  onClick={() => {
                    setTypographyDraft(DEFAULT_PORTAL_TYPOGRAPHY);
                    void runAction(
                      'reset-typography',
                      () => resetTypographySettings(),
                      'Portal typography reset to institutional defaults and synced live via AdminSettingsProvider.'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>
                <button
                  type="button"
                  disabled={busyKey === 'save-typography'}
                  onClick={() =>
                    void runAction(
                      'save-typography',
                      () => updateTypographySettings(typographyDraft),
                      'Global portal fonts, colors & styles published live across all connected clients.'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {busyKey === 'save-typography' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save &amp; Publish Live</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {/* Master Activation Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Enable Custom Portal Typography &amp; Text Colors
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, the settings below override headings, body paragraphs, muted metadata, and links across the landing page and alumni portal.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={typographyDraft.enabled}
                  onClick={() =>
                    setTypographyDraft((prev) => ({ ...prev, enabled: !prev.enabled }))
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    typographyDraft.enabled
                      ? 'bg-blue-600'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      typographyDraft.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Font Families & Text Scale */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Heading / Display Font
                  </label>
                  <select
                    value={typographyDraft.headingFont}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({ ...prev, headingFont: e.target.value, enabled: true }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {PORTAL_FONT_OPTIONS.map((font) => (
                      <option key={font.name} value={font.name}>
                        {font.label} ({font.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Body / Content Font
                  </label>
                  <select
                    value={typographyDraft.bodyFont}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({ ...prev, bodyFont: e.target.value, enabled: true }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {PORTAL_FONT_OPTIONS.map((font) => (
                      <option key={font.name} value={font.name}>
                        {font.label} ({font.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Portal Text Scale
                    </label>
                    <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {Math.round(typographyDraft.baseScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.25}
                    step={0.05}
                    value={typographyDraft.baseScale}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        baseScale: Number(e.target.value),
                        enabled: true,
                      }))
                    }
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                    <span>85%</span>
                    <span>100%</span>
                    <span>125%</span>
                  </div>
                </div>
              </div>

              {/* Weight, Spacing, Line Height & Heading Style */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Heading Weight
                  </label>
                  <select
                    value={typographyDraft.headingWeight}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        headingWeight: e.target.value as PortalTypographyConfig['headingWeight'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="500">Medium (500)</option>
                    <option value="600">Semibold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">Extrabold (800)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Body Weight
                  </label>
                  <select
                    value={typographyDraft.bodyWeight}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        bodyWeight: e.target.value as PortalTypographyConfig['bodyWeight'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="400">Regular (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semibold (600)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Heading Spacing
                  </label>
                  <select
                    value={typographyDraft.headingTracking}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        headingTracking: e.target.value as PortalTypographyConfig['headingTracking'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="tight">Tight</option>
                    <option value="normal">Normal</option>
                    <option value="wide">Wide</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Line Height
                  </label>
                  <select
                    value={typographyDraft.bodyLineHeight}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        bodyLineHeight: e.target.value as PortalTypographyConfig['bodyLineHeight'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="compact">Compact (1.4)</option>
                    <option value="normal">Balanced (1.6)</option>
                    <option value="relaxed">Relaxed (1.8)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Heading Style
                  </label>
                  <select
                    value={typographyDraft.headingStyle}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        headingStyle: e.target.value as PortalTypographyConfig['headingStyle'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="normal">Normal</option>
                    <option value="italic">Italic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Heading Case
                  </label>
                  <select
                    value={typographyDraft.headingTransform}
                    onChange={(e) =>
                      setTypographyDraft((prev) => ({
                        ...prev,
                        headingTransform: e.target.value as PortalTypographyConfig['headingTransform'],
                        enabled: true,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="none">Default</option>
                    <option value="capitalize">Title Case</option>
                    <option value="uppercase">Uppercase</option>
                  </select>
                </div>
              </div>

              {/* Dual-Mode Color Palettes (Light & Dark Mode) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                {/* Light Mode Colors */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Light Mode Text Colors
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        { key: 'headingColorLight', label: 'Heading Text' },
                        { key: 'bodyColorLight', label: 'Body Text' },
                        { key: 'mutedColorLight', label: 'Secondary / Muted' },
                        { key: 'accentColorLight', label: 'Links & Accent' },
                      ] as const
                    ).map((field) => (
                      <div key={field.key}>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={typographyDraft[field.key]}
                            onChange={(e) =>
                              setTypographyDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                                enabled: true,
                              }))
                            }
                            className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
                            aria-label={`${field.label} Light Mode Color`}
                          />
                          <input
                            type="text"
                            value={typographyDraft[field.key]}
                            onChange={(e) =>
                              setTypographyDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                                enabled: true,
                              }))
                            }
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dark Mode Colors */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Dark Mode Text Colors
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        { key: 'headingColorDark', label: 'Heading Text' },
                        { key: 'bodyColorDark', label: 'Body Text' },
                        { key: 'mutedColorDark', label: 'Secondary / Muted' },
                        { key: 'accentColorDark', label: 'Links & Accent' },
                      ] as const
                    ).map((field) => (
                      <div key={field.key}>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={typographyDraft[field.key]}
                            onChange={(e) =>
                              setTypographyDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                                enabled: true,
                              }))
                            }
                            className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer shrink-0"
                            aria-label={`${field.label} Dark Mode Color`}
                          />
                          <input
                            type="text"
                            value={typographyDraft[field.key]}
                            onChange={(e) =>
                              setTypographyDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                                enabled: true,
                              }))
                            }
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Typography & Color Preview */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Live Portal Text Preview
                  </div>
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setTypographyPreviewMode('light')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                        typographyPreviewMode === 'light'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Light Surface
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypographyPreviewMode('dark')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                        typographyPreviewMode === 'dark'
                          ? 'bg-slate-900 text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Dark Surface
                    </button>
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-5 space-y-2.5 transition-colors ${
                    typographyPreviewMode === 'dark'
                      ? 'bg-slate-950 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                  style={{
                    fontFamily: `'${typographyDraft.bodyFont}', system-ui, sans-serif`,
                    fontSize: `${Math.round(14 * typographyDraft.baseScale)}px`,
                    lineHeight:
                      typographyDraft.bodyLineHeight === 'compact'
                        ? 1.4
                        : typographyDraft.bodyLineHeight === 'relaxed'
                        ? 1.8
                        : 1.6,
                  }}
                >
                  <div
                    data-preserve-text-color="true"
                    style={{
                      fontFamily: `'${typographyDraft.headingFont}', system-ui, sans-serif`,
                      fontWeight: Number(typographyDraft.headingWeight),
                      fontStyle: typographyDraft.headingStyle,
                      textTransform: typographyDraft.headingTransform,
                      letterSpacing:
                        typographyDraft.headingTracking === 'tight'
                          ? '-0.025em'
                          : typographyDraft.headingTracking === 'wide'
                          ? '0.03em'
                          : '0em',
                      fontSize: `${Math.round(22 * typographyDraft.baseScale)}px`,
                      color:
                        typographyPreviewMode === 'dark'
                          ? typographyDraft.headingColorDark
                          : typographyDraft.headingColorLight,
                    }}
                  >
                    Shaheed Ziaur Rahman Medical College Alumni Portal
                  </div>
                  <p
                    data-preserve-text-color="true"
                    style={{
                      fontWeight: Number(typographyDraft.bodyWeight),
                      color:
                        typographyPreviewMode === 'dark'
                          ? typographyDraft.bodyColorDark
                          : typographyDraft.bodyColorLight,
                    }}
                  >
                    Uniting 35 MBBS batches, clinical specialists, and healthcare leaders across Bangladesh and worldwide in one living academic fraternity.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <span
                      data-preserve-text-color="true"
                      style={{
                        color:
                          typographyPreviewMode === 'dark'
                            ? typographyDraft.accentColorDark
                            : typographyDraft.accentColorLight,
                        fontWeight: 600,
                      }}
                    >
                      Explore Alumni Directory →
                    </span>
                    <span
                      data-preserve-text-color="true"
                      style={{
                        color:
                          typographyPreviewMode === 'dark'
                            ? typographyDraft.mutedColorDark
                            : typographyDraft.mutedColorLight,
                        fontSize: '0.85em',
                      }}
                    >
                      Silimpur, Bogura · Estd. 1992 · Live Supabase Sync
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: LANDING PAGE, HALL OF FAME & SITE SETTINGS */}
      {section === 'settings' && (
        <div className="space-y-6">
          {/* Quick Global Theme Manager Preset Switcher */}
          <GlobalThemeManager
            compact
            onOpenFullStudio={() => setSection('theme')}
            onNotify={notify}
          />

          {/* Landing Page & Media Controls */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Landing Page &amp; Media Assets
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Changes persist to Supabase site_settings and update every open browser immediately.
                </p>
              </div>
              <button
                type="button"
                disabled={busyKey === 'save-landing'}
                onClick={() =>
                  void runAction(
                    'save-landing',
                    () => updateGlobalSiteConfig({ ...landingDraft, featuredAlumni: hofDraft }),
                    'Landing page and Hall of Fame saved to Supabase in real time.'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {busyKey === 'save-landing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Changes</span>
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Site Title
                </label>
                <input
                  type="text"
                  value={landingDraft.siteTitle}
                  onChange={(e) => setLandingDraft((d) => ({ ...d, siteTitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Site Tagline
                </label>
                <input
                  type="text"
                  value={landingDraft.siteTagline}
                  onChange={(e) => setLandingDraft((d) => ({ ...d, siteTagline: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Hero Headline Prefix / Highlight / Suffix
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={landingDraft.heroPrefix}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, heroPrefix: e.target.value }))}
                    placeholder="Prefix"
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={landingDraft.heroHighlight}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, heroHighlight: e.target.value }))}
                    placeholder="Highlight"
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={landingDraft.heroSuffix}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, heroSuffix: e.target.value }))}
                    placeholder="Suffix"
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Live Ticker Message
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={landingDraft.liveTickerEnabled}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, liveTickerEnabled: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-slate-600"
                    aria-label="Enable live ticker"
                  />
                  <input
                    type="text"
                    value={landingDraft.liveTickerMessage}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, liveTickerMessage: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Hero Subtitle
                </label>
                <textarea
                  rows={2}
                  value={landingDraft.heroSubtitle}
                  onChange={(e) => setLandingDraft((d) => ({ ...d, heroSubtitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Site Logo Upload */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Site Emblem Logo
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {landingDraft.logoUrl ? (
                      <img
                        src={landingDraft.logoUrl}
                        alt="Site logo preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={landingDraft.logoUrl}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, logoUrl: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusyKey('upload-logo');
                        try {
                          const url = await uploadAssetImage(file, 'logo');
                          setLandingDraft((d) => ({ ...d, logoUrl: url }));
                          await updateGlobalSiteConfig({ logoUrl: url });
                          notify('success', 'Logo uploaded to Supabase Storage and synced live.');
                        } catch {
                          notify('error', 'Failed to upload logo image.');
                        } finally {
                          setBusyKey(null);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Hero Background Upload */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Hero Background Image
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                    {landingDraft.heroBackgroundImageUrl ? (
                      <img
                        src={landingDraft.heroBackgroundImageUrl}
                        alt="Hero backdrop preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <input
                    type="text"
                    value={landingDraft.heroBackgroundImageUrl}
                    onChange={(e) => setLandingDraft((d) => ({ ...d, heroBackgroundImageUrl: e.target.value }))}
                    placeholder="Supabase Storage URL"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusyKey('upload-hero');
                        try {
                          const url = await uploadAssetImage(file, 'hero');
                          setLandingDraft((d) => ({ ...d, heroBackgroundImageUrl: url }));
                          await updateGlobalSiteConfig({ heroBackgroundImageUrl: url });
                          notify('success', 'Hero background uploaded to Supabase Storage and synced live.');
                        } catch {
                          notify('error', 'Failed to upload hero image.');
                        } finally {
                          setBusyKey(null);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Hall of Fame Real-Time Manager */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Hall of Fame ({hofDraft.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Add, edit, upload portraits, or remove featured alumni and sync live to Supabase.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setHofDraft((prev) => [
                      ...prev,
                      {
                        id: `hof-${Date.now()}`,
                        name: 'New Distinguished Alumnus',
                        batch: 1,
                        category: 'Medicine',
                        designation: 'Professor & Specialist',
                        institution: 'SZMC Bogura',
                        avatarUrl: '/assets/aistudio/images__1__2778177d.png',
                        achievementSummary: 'Distinguished service in clinical medicine.',
                        order: prev.length + 1,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Member</span>
                </button>
                <button
                  type="button"
                  disabled={busyKey === 'save-hof'}
                  onClick={() =>
                    void runAction(
                      'save-hof',
                      () => updateGlobalSiteConfig({ featuredAlumni: hofDraft }),
                      'Hall of Fame saved to Supabase and broadcast live.'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Hall of Fame</span>
                </button>
              </div>
            </div>

            {hofDraft.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No Hall of Fame entries configured. Click &ldquo;Add Member&rdquo; to create one.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {hofDraft.map((member, idx) => (
                  <div key={member.id || idx} className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0">
                        <Upload className="w-3 h-3" />
                        <span>Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const url = await uploadAssetImage(file, 'hall-of-fame');
                              setHofDraft((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, avatarUrl: url } : item))
                              );
                              notify('success', `Uploaded portrait for ${member.name}. Click Save Hall of Fame to publish.`);
                            } catch {
                              notify('error', 'Failed to upload portrait.');
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) =>
                          setHofDraft((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                          )
                        }
                        placeholder="Full name"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={member.designation}
                        onChange={(e) =>
                          setHofDraft((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, designation: e.target.value } : item))
                          )
                        }
                        placeholder="Designation"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={member.institution}
                        onChange={(e) =>
                          setHofDraft((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, institution: e.target.value } : item))
                          )
                        }
                        placeholder="Institution"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setHofDraft((prev) => prev.filter((_, i) => i !== idx))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap shrink-0 self-start lg:self-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Raw site_settings Key-Value Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Site Settings Key-Value Store
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct CRUD on public.site_settings rows.
              </p>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2.5 items-start">
              <input
                type="text"
                value={newSettingKey}
                onChange={(e) => setNewSettingKey(e.target.value)}
                placeholder="setting_key"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={newSettingJson}
                onChange={(e) => setNewSettingJson(e.target.value)}
                placeholder='{"enabled": true}'
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={busyKey === 'add-setting'}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(newSettingJson);
                    void runAction(
                      'add-setting',
                      () => upsertGlobalSettingKey(newSettingKey, parsed),
                      `Saved setting "${newSettingKey}".`
                    ).then((res) => {
                      if (res.success) {
                        setNewSettingKey('');
                        setNewSettingJson('{}');
                      }
                    });
                  } catch {
                    notify('error', 'Setting value must be valid JSON.');
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Key</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading && siteSettings.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 dark:text-slate-400">Loading settings...</div>
              ) : siteSettings.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 dark:text-slate-400">No site settings found.</div>
              ) : (
                siteSettings.map((row) => {
                  const isEditing = editingSettingKey === row.key;
                  const protectedKey =
                    row.key === 'master_site_config' ||
                    row.key === 'hall_of_fame' ||
                    row.key === 'portal_typography';
                  return (
                    <div key={row.key} className="px-5 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                            {row.key}
                          </span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {formatTimestamp(row.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!isEditing ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSettingKey(row.key);
                                setEditingSettingJson(JSON.stringify(row.value, null, 2));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit JSON</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingSettingKey(null)}
                                className="px-2.5 py-1 rounded-md text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    const parsed = JSON.parse(editingSettingJson);
                                    void runAction(
                                      `save-${row.key}`,
                                      () => upsertGlobalSettingKey(row.key, parsed),
                                      `Updated "${row.key}".`
                                    ).then((res) => {
                                      if (res.success) setEditingSettingKey(null);
                                    });
                                  } catch {
                                    notify('error', 'Invalid JSON syntax.');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </>
                          )}
                          {!protectedKey && (
                            <button
                              type="button"
                              onClick={() => {
                                setPendingConfirm({
                                  title: 'Delete Site Setting',
                                  message: `Delete site setting "${row.key}"? This cannot be undone.`,
                                  confirmLabel: 'Delete Setting',
                                  action: async () => {
                                    await runAction(
                                      `del-${row.key}`,
                                      () => deleteSiteSetting(row.key),
                                      `Deleted "${row.key}".`
                                    );
                                  },
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {isEditing && (
                        <textarea
                          rows={6}
                          value={editingSettingJson}
                          onChange={(e) => setEditingSettingJson(e.target.value)}
                          className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: POSTS CRUD */}
      {section === 'posts' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create Post</h2>
            <textarea
              rows={3}
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              placeholder="Write an official update or community post..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={newPostCategory}
                  onChange={(e) => setNewPostCategory(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                >
                  {POST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPostPinned}
                    onChange={(e) => setNewPostPinned(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  <span>Pin to top</span>
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{newPostImageUrl ? 'Image Attached' : 'Attach Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await uploadAssetImage(file, 'general');
                        setNewPostImageUrl(url);
                        notify('success', 'Post image uploaded to Supabase Storage.');
                      } catch {
                        notify('error', 'Could not upload post image.');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busyKey === 'create-post' || !newPostContent.trim()}
                onClick={() =>
                  void runAction(
                    'create-post',
                    () =>
                      createPost({
                        content: newPostContent,
                        category: newPostCategory,
                        is_pinned: newPostPinned,
                        images: newPostImageUrl ? [newPostImageUrl] : [],
                      }),
                    'Post created and synced live.'
                  ).then((res) => {
                    if (res.success) {
                      setNewPostContent('');
                      setNewPostImageUrl('');
                      setNewPostPinned(false);
                    }
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Publish Post</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                All Feed Posts ({filteredPosts.length})
              </h2>
            </div>

            {loading && posts.length === 0 ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No posts match your filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredPosts.map((post) => {
                  const isEditing = editingPostId === post.id;
                  return (
                    <div key={post.id} className="px-5 py-4 space-y-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums text-slate-400">#{post.id}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{post.author_name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{post.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatTimestamp(post.created_at)}</span>
                          {post.is_pinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-700 dark:text-amber-400 font-medium">Pinned</span>
                            </>
                          )}
                          {post.is_deleted && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-rose-700 dark:text-rose-400 font-medium">Soft-deleted</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void runAction(
                                `pin-${post.id}`,
                                () => updatePost(post.id, { is_pinned: !post.is_pinned }),
                                post.is_pinned ? 'Post unpinned.' : 'Post pinned.'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            {post.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            <span>{post.is_pinned ? 'Unpin' : 'Pin'}</span>
                          </button>

                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => startEditPost(post)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          )}

                          {post.is_deleted ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  `restore-${post.id}`,
                                  () => updatePost(post.id, { is_deleted: false }),
                                  'Post restored.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer whitespace-nowrap"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  `softdel-${post.id}`,
                                  () => deletePost(post.id, false),
                                  'Post hidden from feed.'
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer whitespace-nowrap"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Hide</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setPendingConfirm({
                                title: 'Permanently Delete Post',
                                message: `Permanently delete post #${post.id} from Supabase? This action cannot be undone.`,
                                confirmLabel: 'Delete Post',
                                action: async () => {
                                  await runAction(
                                    `harddel-${post.id}`,
                                    () => deletePost(post.id, true),
                                    `Post #${post.id} permanently deleted.`
                                  );
                                },
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={3}
                            value={editPostDraft.content}
                            onChange={(e) => setEditPostDraft((d) => ({ ...d, content: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <select
                              value={editPostDraft.category}
                              onChange={(e) => setEditPostDraft((d) => ({ ...d, category: e.target.value }))}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                            >
                              {POST_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingPostId(null)}
                                className="px-3 py-1.5 rounded-md text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void runAction(
                                    `edit-post-${post.id}`,
                                    () => updatePost(post.id, editPostDraft),
                                    `Post #${post.id} updated.`
                                  ).then((res) => {
                                    if (res.success) setEditingPostId(null);
                                  })
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line line-clamp-3">
                          {post.content}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: GALLERY ALBUMS & PHOTOS CRUD */}
      {section === 'gallery' && (
        <div className="space-y-6">
          {/* Create Album */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create Gallery Album</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                placeholder="Album title"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                value={newAlbumDesc}
                onChange={(e) => setNewAlbumDesc(e.target.value)}
                placeholder="Short description"
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <select
                value={newAlbumCategory}
                onChange={(e) => setNewAlbumCategory(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                {GALLERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={newAlbumCover}
                onChange={(e) => setNewAlbumCover(e.target.value)}
                placeholder="Cover image URL or upload file"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Cover</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadAssetImage(file, 'general');
                      setNewAlbumCover(url);
                      notify('success', 'Album cover uploaded to Supabase Storage.');
                    } catch {
                      notify('error', 'Failed to upload cover image.');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busyKey === 'create-album' || !newAlbumTitle.trim() || !newAlbumCover.trim()}
                onClick={() =>
                  void runAction(
                    'create-album',
                    () =>
                      createAlbum({
                        title: newAlbumTitle,
                        description: newAlbumDesc,
                        category: newAlbumCategory,
                        cover_photo_url: newAlbumCover,
                        is_published: true,
                      }),
                    'Gallery album created and synced live.'
                  ).then((res) => {
                    if (res.success) {
                      setNewAlbumTitle('');
                      setNewAlbumDesc('');
                      setNewAlbumCover('');
                    }
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Album</span>
              </button>
            </div>
          </div>

          {/* Albums List */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Gallery Albums ({filteredAlbums.length})
              </h2>
              {selectedAlbumId && (
                <button
                  type="button"
                  onClick={() => setSelectedAlbumId(null)}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Show All Photos
                </button>
              )}
            </div>

            {filteredAlbums.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No gallery albums found.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredAlbums.map((album) => {
                  const isEditing = editingAlbumId === album.id;
                  const isSelected = selectedAlbumId === album.id;
                  return (
                    <div key={album.id} className="px-5 py-3.5 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-14 h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                            <img
                              src={album.cover_photo_url}
                              alt={album.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedAlbumId(isSelected ? null : album.id)}
                              className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 text-left truncate block cursor-pointer"
                            >
                              {album.title}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-mono tabular-nums">#{album.id}</span>
                              <span aria-hidden="true">·</span>
                              <span>{album.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {photos.filter((p) => p.album_id === album.id).length} photos
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{album.is_published === false ? 'Draft' : 'Published'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void runAction(
                                `pub-alb-${album.id}`,
                                () => updateAlbum(album.id, { is_published: album.is_published === false }),
                                album.is_published === false ? 'Album published.' : 'Album set to draft.'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            {album.is_published === false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{album.is_published === false ? 'Publish' : 'Unpublish'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditAlbum(album)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingConfirm({
                                title: 'Delete Album',
                                message: `Delete album "${album.title}" and all its photos? This action cannot be undone.`,
                                confirmLabel: 'Delete Album',
                                action: async () => {
                                  await runAction(
                                    `del-alb-${album.id}`,
                                    () => deleteAlbum(album.id),
                                    `Album "${album.title}" deleted.`
                                  );
                                },
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <input
                            type="text"
                            value={editAlbumDraft.title}
                            onChange={(e) => setEditAlbumDraft((d) => ({ ...d, title: e.target.value }))}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            value={editAlbumDraft.description}
                            onChange={(e) => setEditAlbumDraft((d) => ({ ...d, description: e.target.value }))}
                            placeholder="Description"
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingAlbumId(null)}
                              className="px-3 py-1.5 rounded-md text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  `save-alb-${album.id}`,
                                  () => updateAlbum(album.id, editAlbumDraft),
                                  'Album updated.'
                                ).then((res) => {
                                  if (res.success) setEditingAlbumId(null);
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                            >
                              <Save className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gallery Photos Manager */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Gallery Photos ({visiblePhotos.length})
              </h2>
              {albums.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedAlbumId || albums[0].id}
                    onChange={(e) => setSelectedAlbumId(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newPhotoCaption}
                    onChange={(e) => setNewPhotoCaption(e.target.value)}
                    placeholder="Photo caption"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const targetAlbum = selectedAlbumId || albums[0]?.id;
                        if (!targetAlbum) return;
                        setBusyKey('upload-gallery-photo');
                        try {
                          const url = await uploadAssetImage(file, 'general');
                          setNewPhotoUrl(url);
                          const res = await createGalleryPhoto({
                            album_id: targetAlbum,
                            photo_url: url,
                            caption: newPhotoCaption,
                            is_approved: true,
                          });
                          if (res.success) {
                            setNewPhotoCaption('');
                            setNewPhotoUrl('');
                            notify('success', 'Photo uploaded and synced live.');
                          } else {
                            notify('error', res.error || 'Failed to save photo record.');
                          }
                        } catch {
                          notify('error', 'Failed to upload photo.');
                        } finally {
                          setBusyKey(null);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {visiblePhotos.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No photos in this view. Upload a photo above to add it immediately.
              </div>
            ) : (
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {visiblePhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col"
                  >
                    <div className="aspect-4/3 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || `Gallery photo ${photo.id}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                      <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                        {photo.caption || `Photo #${photo.id}`}
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              `appr-${photo.id}`,
                              () => updateGalleryPhoto(photo.id, { is_approved: !photo.is_approved }),
                              photo.is_approved ? 'Photo hidden.' : 'Photo approved.'
                            )
                          }
                          className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                        >
                          {photo.is_approved ? 'Hide' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingConfirm({
                              title: 'Delete Photograph',
                              message: `Delete photo #${photo.id}? This cannot be undone.`,
                              confirmLabel: 'Delete Photo',
                              action: async () => {
                                await runAction(
                                  `del-photo-${photo.id}`,
                                  () => deleteGalleryPhoto(photo.id),
                                  'Photo deleted.'
                                );
                              },
                            });
                          }}
                          className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {newPhotoUrl && <span className="sr-only">{newPhotoUrl}</span>}
        </div>
      )}

      {/* SECTION 4: OFFICIAL NOTICES CRUD */}
      {section === 'notices' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Publish Official Notice</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newNoticeTitle}
                onChange={(e) => setNewNoticeTitle(e.target.value)}
                placeholder="Notice title"
                className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <select
                value={newNoticeCategory}
                onChange={(e) => setNewNoticeCategory(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                {NOTICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={newNoticeSummary}
              onChange={(e) => setNewNoticeSummary(e.target.value)}
              placeholder="One-line summary"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <textarea
              rows={3}
              value={newNoticeContent}
              onChange={(e) => setNewNoticeContent(e.target.value)}
              placeholder="Full notice body..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newNoticeUrgent}
                  onChange={(e) => setNewNoticeUrgent(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span>Mark as urgent</span>
              </label>
              <button
                type="button"
                disabled={busyKey === 'create-notice' || newNoticeTitle.trim().length < 3}
                onClick={() =>
                  void runAction(
                    'create-notice',
                    () =>
                      createNotice({
                        title: newNoticeTitle,
                        category: newNoticeCategory,
                        summary: newNoticeSummary,
                        full_content: newNoticeContent,
                        is_urgent: newNoticeUrgent,
                        is_published: true,
                      }),
                    'Official notice published live.'
                  ).then((res) => {
                    if (res.success) {
                      setNewNoticeTitle('');
                      setNewNoticeSummary('');
                      setNewNoticeContent('');
                      setNewNoticeUrgent(false);
                    }
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Publish Notice</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Official Notices ({filteredNotices.length})
              </h2>
            </div>

            {filteredNotices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No notices found.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredNotices.map((notice) => {
                  const isEditing = editingNoticeId === notice.id;
                  return (
                    <div key={notice.id} className="px-5 py-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {notice.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="font-mono">{notice.ref_no}</span>
                            <span aria-hidden="true">·</span>
                            <span>{notice.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{notice.published_date}</span>
                            <span aria-hidden="true">·</span>
                            <span>{notice.is_published ? 'Published' : 'Draft'}</span>
                            {notice.is_urgent && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-rose-700 dark:text-rose-400 font-medium">Urgent</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void runAction(
                                `pub-notice-${notice.id}`,
                                () => updateNotice(notice.id, { is_published: !notice.is_published }),
                                notice.is_published ? 'Notice unpublished.' : 'Notice published.'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            {notice.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{notice.is_published ? 'Unpublish' : 'Publish'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditNotice(notice)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingConfirm({
                                title: 'Delete Notice',
                                message: `Delete notice "${notice.title}"? This action cannot be undone.`,
                                confirmLabel: 'Delete Notice',
                                action: async () => {
                                  await runAction(
                                    `del-notice-${notice.id}`,
                                    () => deleteNotice(notice.id),
                                    'Notice deleted.'
                                  );
                                },
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <input
                            type="text"
                            value={editNoticeDraft.title}
                            onChange={(e) => setEditNoticeDraft((d) => ({ ...d, title: e.target.value }))}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <textarea
                            rows={3}
                            value={editNoticeDraft.full_content}
                            onChange={(e) => setEditNoticeDraft((d) => ({ ...d, full_content: e.target.value }))}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNoticeId(null)}
                              className="px-3 py-1.5 rounded-md text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void runAction(
                                  `save-notice-${notice.id}`,
                                  () => updateNotice(notice.id, editNoticeDraft),
                                  'Notice updated.'
                                ).then((res) => {
                                  if (res.success) setEditingNoticeId(null);
                                })
                              }
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                            >
                              <Save className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 5: MESSAGES CRUD */}
      {section === 'messages' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Messages ({filteredMessages.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Edit, soft-delete, or permanently remove any message in real time.
            </p>
          </div>

          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No messages found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredMessages.map((msg) => {
                const isEditing = editingMessageId === msg.id;
                return (
                  <div key={msg.id} className="px-5 py-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{msg.sender_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatTimestamp(msg.created_at)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] truncate max-w-[140px]">{msg.conversation_id}</span>
                        {msg.deleted_at && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-rose-700 dark:text-rose-400 font-medium">Deleted</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isEditing && !msg.deleted_at && (
                          <button
                            type="button"
                            onClick={() => startEditMessage(msg)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}
                        {!msg.deleted_at && (
                          <button
                            type="button"
                            onClick={() =>
                              void runAction(
                                `softdel-msg-${msg.id}`,
                                () => deleteMessage(msg.id, false),
                                'Message soft-deleted.'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer whitespace-nowrap"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPendingConfirm({
                              title: 'Delete Message',
                              message: 'Permanently delete this message from Supabase? This action cannot be undone.',
                              confirmLabel: 'Delete Message',
                              action: async () => {
                                await runAction(
                                  `harddel-msg-${msg.id}`,
                                  () => deleteMessage(msg.id, true),
                                  'Message permanently deleted.'
                                );
                              },
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editMessageBody}
                          onChange={(e) => setEditMessageBody(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingMessageId(null)}
                          className="px-2.5 py-1.5 rounded-md text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              `save-msg-${msg.id}`,
                              () => updateMessage(msg.id, editMessageBody),
                              'Message updated.'
                            ).then((res) => {
                              if (res.success) setEditingMessageId(null);
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          <span>Save</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-800 dark:text-slate-200 break-words">
                        {msg.deleted_at ? <span className="italic text-slate-400">Deleted message</span> : msg.body}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </motion.div>
      </AnimatePresence>

      {/* Real-Time Database Event Log (Only real Supabase postgres_changes events) */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Live Channel Activity
          </h3>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {recentEvents.length} events
          </span>
        </div>
        {recentEvents.length === 0 ? (
          <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
            Listening for real-time INSERT, UPDATE, and DELETE events across {subscribedTables.length} Supabase tables.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
            {recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="px-5 py-2 flex items-center justify-between gap-3 text-xs font-mono tabular-nums"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{ev.eventType}</span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-slate-700 dark:text-slate-300">{ev.table}</span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-slate-500 dark:text-slate-400 truncate">{ev.recordId}</span>
                </div>
                <span className="text-slate-400 shrink-0">{formatTimeOnly(ev.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <ConfirmActionModal
        isOpen={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || 'Confirm Action'}
        message={pendingConfirm?.message || ''}
        confirmLabel={pendingConfirm?.confirmLabel || 'Confirm'}
        onConfirm={async () => {
          const action = pendingConfirm?.action;
          setPendingConfirm(null);
          if (action) await action();
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};

export const AdminControlPanel: React.FC<AdminControlPanelProps> = (props) => {
  const existingRealtimeCtx = useOptionalAdminRealtime();
  const existingSettingsCtx = useOptionalAdminSettings();

  let content: React.ReactNode = <AdminControlPanelInner {...props} />;

  if (!existingRealtimeCtx) {
    content = <AdminRealtimeProvider>{content}</AdminRealtimeProvider>;
  }

  if (!existingSettingsCtx) {
    content = <AdminSettingsProvider>{content}</AdminSettingsProvider>;
  }

  return <>{content}</>;
};

export default AdminControlPanel;
