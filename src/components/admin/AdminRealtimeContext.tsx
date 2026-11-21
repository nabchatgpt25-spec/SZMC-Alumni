import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { isUserGeneralAdmin, isUserSuperAdmin } from '../../types';
import {
  getSiteConfig,
  saveSiteConfig,
  saveSiteConfigToServer,
  uploadSiteAssetImage,
  type SiteConfig,
} from '../../services/siteConfigService';
import { realtimeManager } from '../../services/supabaseRealtimeService';

export interface AdminSiteSettingRow {
  key: string;
  value: any;
  updated_at?: string | null;
}

export interface AdminPostRow {
  id: number;
  author_id: number;
  author_name?: string;
  category: string;
  content: string;
  image_url?: string | null;
  images?: string[] | null;
  videos?: string[] | null;
  likes_count: number;
  comments_count: number;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface AdminGalleryAlbumRow {
  id: number;
  title: string;
  description?: string | null;
  cover_photo_url: string;
  batch_year?: number | null;
  category: string;
  photo_count: number;
  created_by_id: number;
  is_published?: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface AdminGalleryPhotoRow {
  id: number;
  album_id: number;
  photo_url: string;
  caption?: string | null;
  uploader_id: number;
  likes_count: number;
  is_approved: boolean;
  uploaded_at: string;
}

export interface AdminNoticeRow {
  id: string;
  ref_no: string;
  title: string;
  category: string;
  published_date: string;
  is_urgent: boolean;
  summary: string;
  full_content: string;
  signatory_name: string;
  signatory_designation: string;
  signatory_organization: string;
  is_published: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface AdminMessageRow {
  id: string;
  conversation_id: string;
  sender_id: number;
  sender_name?: string;
  type: string;
  body: string;
  media_url?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface RealtimeTableEvent {
  id: string;
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | 'BROADCAST';
  recordId: string;
  timestamp: string;
}

export type RealtimeChannelStatus = 'connecting' | 'subscribed' | 'error' | 'offline';

export interface MutationResult {
  success: boolean;
  error?: string;
}

export interface AdminRealtimeContextValue {
  isSuperAdminAuthorized: boolean;
  loading: boolean;
  error: string | null;
  connectionStatus: RealtimeChannelStatus;
  subscribedTables: readonly string[];
  lastSyncedAt: string | null;
  recentEvents: RealtimeTableEvent[];

  siteSettings: AdminSiteSettingRow[];
  siteConfig: SiteConfig;
  posts: AdminPostRow[];
  albums: AdminGalleryAlbumRow[];
  photos: AdminGalleryPhotoRow[];
  notices: AdminNoticeRow[];
  messages: AdminMessageRow[];

  refreshAll: () => Promise<void>;

  // Site settings & landing page / Hall of Fame CRUD
  updateLandingConfig: (patch: Partial<SiteConfig>) => Promise<MutationResult>;
  upsertSiteSetting: (key: string, value: unknown) => Promise<MutationResult>;
  deleteSiteSetting: (key: string) => Promise<MutationResult>;
  uploadAssetImage: (
    file: File,
    folder?: 'hero' | 'logo' | 'hall-of-fame' | 'banner' | 'general'
  ) => Promise<string>;

  // Posts CRUD
  createPost: (input: {
    content: string;
    category: string;
    is_pinned?: boolean;
    images?: string[];
  }) => Promise<MutationResult>;
  updatePost: (
    id: number,
    patch: Partial<Pick<AdminPostRow, 'content' | 'category' | 'is_pinned' | 'is_deleted' | 'images'>>
  ) => Promise<MutationResult>;
  deletePost: (id: number, hardDelete?: boolean) => Promise<MutationResult>;

  // Gallery Albums & Photos CRUD
  createAlbum: (input: {
    title: string;
    description?: string;
    category: string;
    cover_photo_url: string;
    is_published?: boolean;
  }) => Promise<MutationResult>;
  updateAlbum: (
    id: number,
    patch: Partial<Pick<AdminGalleryAlbumRow, 'title' | 'description' | 'category' | 'cover_photo_url' | 'is_published'>>
  ) => Promise<MutationResult>;
  deleteAlbum: (id: number) => Promise<MutationResult>;
  createGalleryPhoto: (input: {
    album_id: number;
    photo_url: string;
    caption?: string;
    is_approved?: boolean;
  }) => Promise<MutationResult>;
  updateGalleryPhoto: (
    id: number,
    patch: Partial<Pick<AdminGalleryPhotoRow, 'caption' | 'is_approved' | 'photo_url'>>
  ) => Promise<MutationResult>;
  deleteGalleryPhoto: (id: number) => Promise<MutationResult>;

  // Official Notices CRUD
  createNotice: (input: {
    title: string;
    category: string;
    summary: string;
    full_content: string;
    is_urgent?: boolean;
    is_published?: boolean;
    signatory_name?: string;
    signatory_designation?: string;
  }) => Promise<MutationResult>;
  updateNotice: (
    id: string,
    patch: Partial<Pick<AdminNoticeRow, 'title' | 'category' | 'summary' | 'full_content' | 'is_urgent' | 'is_published'>>
  ) => Promise<MutationResult>;
  deleteNotice: (id: string) => Promise<MutationResult>;

  // Messages CRUD
  updateMessage: (id: string, body: string) => Promise<MutationResult>;
  deleteMessage: (id: string, hardDelete?: boolean) => Promise<MutationResult>;
}

const MAIN_REALTIME_TABLES = [
  'site_settings',
  'hall_of_fame',
  'featured_alumni',
  'posts',
  'post_comments',
  'gallery_albums',
  'gallery_photos',
  'official_notices',
  'messages',
  'conversations',
  'blood_requests',
  'events',
  'career_opportunities',
] as const;

const AdminRealtimeContext = createContext<AdminRealtimeContextValue | null>(null);

export const AdminRealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoggedIn, isAdminUser } = useAuth();

  const isSuperAdminAuthorized = useMemo(() => {
    if (!isLoggedIn || !currentUser) return false;
    return (
      isAdminUser ||
      currentUser.role === 'admin' ||
      (currentUser as any).role === 'super_admin' ||
      isUserSuperAdmin(currentUser) ||
      isUserGeneralAdmin(currentUser)
    );
  }, [isLoggedIn, currentUser, isAdminUser]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeChannelStatus>(
    isSupabaseConfigured ? 'connecting' : 'offline'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RealtimeTableEvent[]>([]);

  const [siteSettings, setSiteSettings] = useState<AdminSiteSettingRow[]>([]);
  const [siteConfig, setSiteConfigState] = useState<SiteConfig>(() => getSiteConfig());
  const [posts, setPosts] = useState<AdminPostRow[]>([]);
  const [albums, setAlbums] = useState<AdminGalleryAlbumRow[]>([]);
  const [photos, setPhotos] = useState<AdminGalleryPhotoRow[]>([]);
  const [notices, setNotices] = useState<AdminNoticeRow[]>([]);
  const [messages, setMessages] = useState<AdminMessageRow[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const profileNameMapRef = useRef<Map<number, string>>(new Map());
  const refreshTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const pushEvent = useCallback(
    (table: string, eventType: RealtimeTableEvent['eventType'], recordId: string) => {
      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setRecentEvents((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          table,
          eventType,
          recordId,
          timestamp: nowIso,
        },
        ...prev.slice(0, 24),
      ]);
    },
    []
  );

  const loadSiteSettings = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error: err } = await supabase
      .from('site_settings')
      .select('key, value, updated_at')
      .order('key', { ascending: true });
    if (err) throw err;
    const rows = (data || []) as AdminSiteSettingRow[];
    setSiteSettings(rows);

    const masterRow = rows.find((r) => r.key === 'master_site_config');
    const hofRow = rows.find((r) => r.key === 'hall_of_fame');
    const patch: Partial<SiteConfig> =
      masterRow?.value && typeof masterRow.value === 'object' ? { ...masterRow.value } : {};
    const hofMembers = hofRow?.value?.members ?? hofRow?.value;
    if (Array.isArray(hofMembers)) {
      patch.featuredAlumni = hofMembers;
    }
    if (Object.keys(patch).length > 0) {
      const merged = saveSiteConfig(patch);
      setSiteConfigState(merged);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error: err } = await supabase
      .from('posts')
      .select(
        'id, author_id, category, content, image_url, images, videos, likes_count, comments_count, is_pinned, is_edited, is_deleted, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) throw err;
    const mapped = (data || []).map((row: any) => ({
      ...row,
      author_name: profileNameMapRef.current.get(Number(row.author_id)) || `Profile #${row.author_id}`,
    })) as AdminPostRow[];
    setPosts(mapped);
  }, []);

  const loadGallery = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const [albRes, photoRes] = await Promise.all([
      supabase
        .from('gallery_albums')
        .select('id, title, description, cover_photo_url, batch_year, category, photo_count, created_by_id, is_published, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('gallery_photos')
        .select('id, album_id, photo_url, caption, uploader_id, likes_count, is_approved, uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(250),
    ]);
    if (albRes.error) throw albRes.error;
    if (photoRes.error) throw photoRes.error;
    setAlbums((albRes.data || []) as AdminGalleryAlbumRow[]);
    setPhotos((photoRes.data || []) as AdminGalleryPhotoRow[]);
  }, []);

  const loadNotices = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error: err } = await supabase
      .from('official_notices')
      .select(
        'id, ref_no, title, category, published_date, is_urgent, summary, full_content, signatory_name, signatory_designation, signatory_organization, is_published, created_at, updated_at'
      )
      .order('published_date', { ascending: false })
      .limit(100);
    if (err) throw err;
    setNotices((data || []) as AdminNoticeRow[]);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error: err } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, type, body, media_url, created_at, edited_at, deleted_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (err) throw err;
    const mapped = (data || []).map((row: any) => ({
      ...row,
      sender_name: profileNameMapRef.current.get(Number(row.sender_id)) || `Profile #${row.sender_id}`,
    })) as AdminMessageRow[];
    setMessages(mapped);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setConnectionStatus('offline');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Load profile display names for author/sender labels
      const { data: profData } = await supabase
        .from('alumni_profiles')
        .select('id, full_name')
        .limit(500);
      if (Array.isArray(profData)) {
        const nextMap = new Map<number, string>();
        for (const p of profData) {
          if (p?.id && p?.full_name) nextMap.set(Number(p.id), String(p.full_name));
        }
        profileNameMapRef.current = nextMap;
      }

      const settled = await Promise.allSettled([
        loadSiteSettings(),
        loadPosts(),
        loadGallery(),
        loadNotices(),
        loadMessages(),
      ]);

      const firstError = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (firstError) {
        setError(firstError.reason?.message || 'Some tables could not be loaded.');
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin control panel data.');
    } finally {
      setLoading(false);
    }
  }, [loadSiteSettings, loadPosts, loadGallery, loadNotices, loadMessages]);

  const scheduleTableRefresh = useCallback(
    (table: string) => {
      if (refreshTimersRef.current[table]) {
        clearTimeout(refreshTimersRef.current[table]);
      }
      refreshTimersRef.current[table] = setTimeout(() => {
        delete refreshTimersRef.current[table];
        if (table === 'site_settings' || table === 'hall_of_fame' || table === 'featured_alumni') {
          void loadSiteSettings().catch(() => {});
        } else if (table === 'posts' || table === 'post_comments') {
          void loadPosts().catch(() => {});
        } else if (table === 'gallery_albums' || table === 'gallery_photos') {
          void loadGallery().catch(() => {});
        } else if (table === 'official_notices') {
          void loadNotices().catch(() => {});
        } else if (table === 'messages' || table === 'conversations') {
          void loadMessages().catch(() => {});
        }
      }, 150);
    },
    [loadSiteSettings, loadPosts, loadGallery, loadNotices, loadMessages]
  );

  // Initial fetch + Supabase Realtime multi-table subscription via supabase.channel
  useEffect(() => {
    if (!isSuperAdminAuthorized) {
      setLoading(false);
      return;
    }

    void refreshAll();

    if (!isSupabaseConfigured) {
      setConnectionStatus('offline');
      return;
    }

    setConnectionStatus('connecting');
    const channel = supabase.channel('szmc-admin-control-realtime', {
      config: { broadcast: { self: false } },
    });

    for (const tableName of MAIN_REALTIME_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
          const rec = (payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old) as Record<string, any> | undefined;
          const recordId = String(rec?.id ?? rec?.key ?? '—');
          pushEvent(tableName, payload.eventType as RealtimeTableEvent['eventType'], recordId);
          scheduleTableRefresh(tableName);
        }
      );
    }

    channel.on('broadcast', { event: 'admin_sync' }, ({ payload }) => {
      const table = String(payload?.table || 'site_settings');
      const recordId = String(payload?.recordId || 'sync');
      pushEvent(table, 'BROADCAST', recordId);
      scheduleTableRefresh(table);
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setConnectionStatus('subscribed');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnectionStatus('error');
      } else if (status === 'CLOSED') {
        setConnectionStatus('offline');
      }
    });

    channelRef.current = channel;

    return () => {
      Object.values(refreshTimersRef.current).forEach((t) => clearTimeout(t));
      refreshTimersRef.current = {};
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isSuperAdminAuthorized, refreshAll, pushEvent, scheduleTableRefresh]);

  const broadcastSync = useCallback((table: string, recordId: string) => {
    if (!channelRef.current) return;
    void channelRef.current
      .send({
        type: 'broadcast',
        event: 'admin_sync',
        payload: { table, recordId, ts: Date.now() },
      })
      .catch(() => {});
  }, []);

  const ensureAuthorized = useCallback((): MutationResult | null => {
    if (!isSuperAdminAuthorized) {
      return { success: false, error: 'Super Admin authentication is required for this action.' };
    }
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured in this environment.' };
    }
    return null;
  }, [isSuperAdminAuthorized]);

  // --- Site Settings & Landing Page CRUD ---
  const updateLandingConfig = useCallback(
    async (patch: Partial<SiteConfig>): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const res = await saveSiteConfigToServer(patch);
      if (res.success) {
        const latest = getSiteConfig();
        setSiteConfigState(latest);
        realtimeManager.broadcastSiteConfigUpdate(latest);
        broadcastSync('site_settings', 'master_site_config');
        await loadSiteSettings().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to save landing configuration.' };
    },
    [ensureAuthorized, broadcastSync, loadSiteSettings]
  );

  const upsertSiteSetting = useCallback(
    async (key: string, value: unknown): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const cleanKey = key.trim();
      if (!cleanKey) return { success: false, error: 'Setting key is required.' };

      const { error: err } = await supabase
        .from('site_settings')
        .upsert({ key: cleanKey, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (err) return { success: false, error: err.message };

      if (cleanKey === 'master_site_config' && value && typeof value === 'object') {
        const merged = saveSiteConfig(value as Partial<SiteConfig>);
        setSiteConfigState(merged);
        realtimeManager.broadcastSiteConfigUpdate(merged);
      }
      broadcastSync('site_settings', cleanKey);
      await loadSiteSettings().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadSiteSettings]
  );

  const deleteSiteSetting = useCallback(
    async (key: string): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase.from('site_settings').delete().eq('key', key);
      if (err) return { success: false, error: err.message };
      broadcastSync('site_settings', key);
      setSiteSettings((prev) => prev.filter((r) => r.key !== key));
      return { success: true };
    },
    [ensureAuthorized, broadcastSync]
  );

  const uploadAssetImage = useCallback(
    async (file: File, folder: 'hero' | 'logo' | 'hall-of-fame' | 'banner' | 'general' = 'general') => {
      return uploadSiteAssetImage(file, folder, folder === 'hero' ? 1920 : 1200, 0.88);
    },
    []
  );

  // --- Posts CRUD ---
  const createPost = useCallback(
    async (input: {
      content: string;
      category: string;
      is_pinned?: boolean;
      images?: string[];
    }): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      if (!input.content.trim()) return { success: false, error: 'Post content is required.' };

      const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
      const { data, error: err } = await supabase
        .from('posts')
        .insert({
          author_id: currentUser.id,
          category: input.category || 'General Update',
          content: input.content.trim(),
          image_url: images[0] || null,
          images,
          media_urls: images,
          is_pinned: Boolean(input.is_pinned),
          is_edited: false,
          is_deleted: false,
        })
        .select('id')
        .single();
      if (err) return { success: false, error: err.message };
      broadcastSync('posts', String(data?.id || 'new'));
      await loadPosts().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, currentUser, broadcastSync, loadPosts]
  );

  const updatePost = useCallback(
    async (
      id: number,
      patch: Partial<Pick<AdminPostRow, 'content' | 'category' | 'is_pinned' | 'is_deleted' | 'images'>>
    ): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const payload: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
      if (patch.content !== undefined) payload.is_edited = true;
      if (patch.images !== undefined) {
        payload.media_urls = patch.images;
        payload.image_url = patch.images?.[0] || null;
      }
      const { error: err } = await supabase.from('posts').update(payload).eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('posts', String(id));
      await loadPosts().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadPosts]
  );

  const deletePost = useCallback(
    async (id: number, hardDelete = false): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = hardDelete
        ? await supabase.from('posts').delete().eq('id', id)
        : await supabase.from('posts').update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('posts', String(id));
      await loadPosts().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadPosts]
  );

  // --- Gallery Albums & Photos CRUD ---
  const createAlbum = useCallback(
    async (input: {
      title: string;
      description?: string;
      category: string;
      cover_photo_url: string;
      is_published?: boolean;
    }): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      if (!input.title.trim()) return { success: false, error: 'Album title is required.' };
      if (!input.cover_photo_url.trim()) return { success: false, error: 'Cover image is required.' };

      const { data, error: err } = await supabase
        .from('gallery_albums')
        .insert({
          title: input.title.trim(),
          description: input.description?.trim() || null,
          category: input.category || 'campus',
          cover_photo_url: input.cover_photo_url.trim(),
          created_by_id: currentUser.id,
          is_published: input.is_published !== false,
        })
        .select('id')
        .single();
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_albums', String(data?.id || 'new'));
      await loadGallery().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, currentUser, broadcastSync, loadGallery]
  );

  const updateAlbum = useCallback(
    async (
      id: number,
      patch: Partial<Pick<AdminGalleryAlbumRow, 'title' | 'description' | 'category' | 'cover_photo_url' | 'is_published'>>
    ): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase
        .from('gallery_albums')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_albums', String(id));
      await loadGallery().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadGallery]
  );

  const deleteAlbum = useCallback(
    async (id: number): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase.from('gallery_albums').delete().eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_albums', String(id));
      setAlbums((prev) => prev.filter((a) => a.id !== id));
      setPhotos((prev) => prev.filter((p) => p.album_id !== id));
      return { success: true };
    },
    [ensureAuthorized, broadcastSync]
  );

  const createGalleryPhoto = useCallback(
    async (input: {
      album_id: number;
      photo_url: string;
      caption?: string;
      is_approved?: boolean;
    }): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      if (!input.photo_url.trim()) return { success: false, error: 'Photo URL or uploaded file is required.' };

      const { data, error: err } = await supabase
        .from('gallery_photos')
        .insert({
          album_id: input.album_id,
          photo_url: input.photo_url.trim(),
          caption: input.caption?.trim() || null,
          uploader_id: currentUser.id,
          is_approved: input.is_approved !== false,
        })
        .select('id')
        .single();
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_photos', String(data?.id || 'new'));
      await loadGallery().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, currentUser, broadcastSync, loadGallery]
  );

  const updateGalleryPhoto = useCallback(
    async (
      id: number,
      patch: Partial<Pick<AdminGalleryPhotoRow, 'caption' | 'is_approved' | 'photo_url'>>
    ): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase.from('gallery_photos').update(patch).eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_photos', String(id));
      await loadGallery().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadGallery]
  );

  const deleteGalleryPhoto = useCallback(
    async (id: number): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase.from('gallery_photos').delete().eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('gallery_photos', String(id));
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      return { success: true };
    },
    [ensureAuthorized, broadcastSync]
  );

  // --- Official Notices CRUD ---
  const createNotice = useCallback(
    async (input: {
      title: string;
      category: string;
      summary: string;
      full_content: string;
      is_urgent?: boolean;
      is_published?: boolean;
      signatory_name?: string;
      signatory_designation?: string;
    }): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      if (input.title.trim().length < 3) {
        return { success: false, error: 'Notice title must be at least 3 characters.' };
      }

      const refNo = `SZMC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const { data, error: err } = await supabase
        .from('official_notices')
        .insert({
          ref_no: refNo,
          title: input.title.trim(),
          category: input.category || 'General',
          summary: input.summary.trim() || input.title.trim(),
          full_content: input.full_content.trim() || input.summary.trim() || input.title.trim(),
          is_urgent: Boolean(input.is_urgent),
          is_published: input.is_published !== false,
          signatory_name: input.signatory_name?.trim() || currentUser.fullName || 'SZMC Secretariat',
          signatory_designation: input.signatory_designation?.trim() || 'Super Administrator',
          signatory_organization: 'Shaheed Ziaur Rahman Medical College Alumni Association',
          created_by: currentUser.id,
        })
        .select('id')
        .single();
      if (err) return { success: false, error: err.message };
      broadcastSync('official_notices', String(data?.id || 'new'));
      await loadNotices().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, currentUser, broadcastSync, loadNotices]
  );

  const updateNotice = useCallback(
    async (
      id: string,
      patch: Partial<Pick<AdminNoticeRow, 'title' | 'category' | 'summary' | 'full_content' | 'is_urgent' | 'is_published'>>
    ): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase
        .from('official_notices')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('official_notices', id);
      await loadNotices().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadNotices]
  );

  const deleteNotice = useCallback(
    async (id: string): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = await supabase.from('official_notices').delete().eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('official_notices', id);
      setNotices((prev) => prev.filter((n) => n.id !== id));
      return { success: true };
    },
    [ensureAuthorized, broadcastSync]
  );

  // --- Messages CRUD ---
  const updateMessage = useCallback(
    async (id: string, body: string): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const clean = body.trim();
      if (!clean) return { success: false, error: 'Message body cannot be empty.' };
      const { error: err } = await supabase
        .from('messages')
        .update({ body: clean, edited_at: new Date().toISOString() })
        .eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('messages', id);
      await loadMessages().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadMessages]
  );

  const deleteMessage = useCallback(
    async (id: string, hardDelete = false): Promise<MutationResult> => {
      const denied = ensureAuthorized();
      if (denied) return denied;
      const { error: err } = hardDelete
        ? await supabase.from('messages').delete().eq('id', id)
        : await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (err) return { success: false, error: err.message };
      broadcastSync('messages', id);
      await loadMessages().catch(() => {});
      return { success: true };
    },
    [ensureAuthorized, broadcastSync, loadMessages]
  );

  const value = useMemo<AdminRealtimeContextValue>(
    () => ({
      isSuperAdminAuthorized,
      loading,
      error,
      connectionStatus,
      subscribedTables: MAIN_REALTIME_TABLES,
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
      updateLandingConfig,
      upsertSiteSetting,
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
    }),
    [
      isSuperAdminAuthorized,
      loading,
      error,
      connectionStatus,
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
      updateLandingConfig,
      upsertSiteSetting,
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
    ]
  );

  return <AdminRealtimeContext.Provider value={value}>{children}</AdminRealtimeContext.Provider>;
};

export function useOptionalAdminRealtime(): AdminRealtimeContextValue | null {
  return useContext(AdminRealtimeContext);
}

export function useAdminRealtime(): AdminRealtimeContextValue {
  const ctx = useContext(AdminRealtimeContext);
  if (!ctx) {
    throw new Error('useAdminRealtime must be used within an AdminRealtimeProvider.');
  }
  return ctx;
}
