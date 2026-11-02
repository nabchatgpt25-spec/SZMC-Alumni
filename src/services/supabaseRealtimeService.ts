/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'OFFLINE';

export interface RealtimeFeedEvent {
  table: 'posts' | 'post_comments' | 'post_likes';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord: any;
  oldRecord: any;
}

export interface RealtimeBloodEvent {
  table: 'blood_requests' | 'blood_donors' | 'blood_request_responses';
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord: any;
  oldRecord: any;
}

export interface RealtimeAlumniEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord: any;
  oldRecord: any;
}

export interface RealtimeHallOfFameEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | 'SYNC';
  featuredAlumni: any[];
  config?: any;
  timestamp: number;
}

export interface RealtimeSiteSettingsEvent {
  key: string;
  value: any;
  timestamp: number;
}

class SupabaseRealtimeManager {
  private feedChannel: RealtimeChannel | null = null;
  private bloodChannel: RealtimeChannel | null = null;
  private alumniChannel: RealtimeChannel | null = null;
  private noticesChannel: RealtimeChannel | null = null;
  private hallOfFameChannel: RealtimeChannel | null = null;
  private eventsChannel: RealtimeChannel | null = null;
  private userNotificationChannels = new Map<number, RealtimeChannel>();

  private feedListeners = new Set<(event: RealtimeFeedEvent) => void>();
  private bloodListeners = new Set<(event: RealtimeBloodEvent) => void>();
  private alumniListeners = new Set<(event: RealtimeAlumniEvent) => void>();
  private noticesListeners = new Set<(event: any) => void>();
  private hallOfFameListeners = new Set<(event: RealtimeHallOfFameEvent) => void>();
  private siteSettingsListeners = new Set<(event: RealtimeSiteSettingsEvent) => void>();
  private eventsListeners = new Set<(event: any) => void>();
  private userNotificationListeners = new Map<number, Set<(notification: any) => void>>();

  private status: RealtimeStatus = isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE';
  private statusListeners = new Set<(status: RealtimeStatus) => void>();
  private sseInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.ensureUnifiedSseStream();
      if (isSupabaseConfigured) {
        this.initSharedChannels();
      }
    }
  }

  public getStatus(): RealtimeStatus {
    return this.status;
  }

  public onStatusChange(callback: (status: RealtimeStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  private setStatus(newStatus: RealtimeStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => cb(newStatus));
    }
  }

  // ---------------------------------------------------------------------------
  // UNIFIED SERVER-SENT EVENTS (SSE) STREAM FOR INSTANT CROSS-CLIENT SYNC
  // ---------------------------------------------------------------------------
  private ensureUnifiedSseStream() {
    if (this.sseInitialized || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return;
    }
    this.sseInitialized = true;

    try {
      const es = new EventSource('/api/feed/stream');
      es.onopen = () => {
        this.setStatus('SUBSCRIBED');
      };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!data || !data.type) return;

          if (data.type === 'POST_CREATED') {
            const event: RealtimeFeedEvent = {
              table: 'posts',
              eventType: 'INSERT',
              newRecord: data.post || data.newRecord,
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          } else if (data.type === 'POST_LIKED' || data.type === 'POST_REACTED') {
            const event: RealtimeFeedEvent = {
              table: 'post_likes',
              eventType: 'UPDATE',
              newRecord: {
                post_id: data.postId,
                postId: data.postId,
                user_id: data.userId,
                userId: data.userId,
                likes_count: data.likesCount,
                likesCount: data.likesCount,
                reaction: data.reaction,
                reactionsSummary: data.reactionsSummary,
                liked: data.liked,
              },
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          } else if (data.type === 'POST_COMMENTED') {
            const event: RealtimeFeedEvent = {
              table: 'post_comments',
              eventType: 'INSERT',
              newRecord: data.comment,
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          } else if (data.type === 'POST_REPLY') {
            const event: RealtimeFeedEvent = {
              table: 'post_comments',
              eventType: 'UPDATE',
              newRecord: {
                post_id: data.postId,
                postId: data.postId,
                parentCommentId: data.parentCommentId,
                reply: data.reply,
              },
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          } else if (
            data.type === 'SITE_CONFIG_UPDATED' ||
            data.type === 'HALL_OF_FAME_UPDATED' ||
            (data.type === 'CONNECTED' && data.config)
          ) {
            const cfg = data.config;
            if (cfg && typeof cfg === 'object') {
              this.siteSettingsListeners.forEach((cb) =>
                cb({
                  key: 'master_site_config',
                  value: cfg,
                  timestamp: data.timestamp || Date.now(),
                })
              );
              if (Array.isArray(cfg.featuredAlumni)) {
                this.hallOfFameListeners.forEach((cb) =>
                  cb({
                    eventType: 'SYNC',
                    featuredAlumni: cfg.featuredAlumni,
                    config: cfg,
                    timestamp: data.timestamp || Date.now(),
                  })
                );
              }
            } else if (Array.isArray(data.featuredAlumni)) {
              this.hallOfFameListeners.forEach((cb) =>
                cb({
                  eventType: 'SYNC',
                  featuredAlumni: data.featuredAlumni,
                  timestamp: data.timestamp || Date.now(),
                })
              );
            }
          } else if (data.type === 'ALUMNI_UPDATED' || data.type === 'ALUMNI_REGISTERED') {
            const event: RealtimeAlumniEvent = {
              eventType: data.type === 'ALUMNI_REGISTERED' ? 'INSERT' : 'UPDATE',
              newRecord: data.profile || data.newRecord,
              oldRecord: null,
            };
            this.alumniListeners.forEach((cb) => cb(event));
          } else if (data.type === 'BLOOD_UPDATED') {
            const event: RealtimeBloodEvent = {
              table: data.table || 'blood_requests',
              eventType: data.eventType || 'INSERT',
              newRecord: data.record || data.newRecord,
              oldRecord: null,
            };
            this.bloodListeners.forEach((cb) => cb(event));
          } else if (data.type === 'NOTICE_UPDATED') {
            this.noticesListeners.forEach((cb) => cb(data.notice || data));
          } else if (data.type === 'GALLERY_UPDATED') {
            this.galleryListeners.forEach((cb) => cb(data));
          } else if (data.type === 'EVENT_UPDATED') {
            this.eventsListeners.forEach((cb) => cb(data));
          }
        } catch {}
      };
    } catch (esErr) {
      console.warn('SSE stream notice:', esErr);
    }
  }

  // ---------------------------------------------------------------------------
  // 0. HALL OF FAME & SITE SETTINGS REALTIME CHANNEL (postgres_changes + broadcast)
  // ---------------------------------------------------------------------------
  public subscribeToHallOfFame(listener: (event: RealtimeHallOfFameEvent) => void): () => void {
    this.hallOfFameListeners.add(listener);
    this.ensureHallOfFameAndSiteChannel();
    return () => {
      this.hallOfFameListeners.delete(listener);
    };
  }

  public subscribeToSiteSettings(listener: (event: RealtimeSiteSettingsEvent) => void): () => void {
    this.siteSettingsListeners.add(listener);
    this.ensureHallOfFameAndSiteChannel();
    return () => {
      this.siteSettingsListeners.delete(listener);
    };
  }

  public broadcastSiteConfigUpdate(config: any) {
    if (!config || typeof config !== 'object') return;
    if (this.hallOfFameChannel && isSupabaseConfigured) {
      try {
        void this.hallOfFameChannel.send({
          type: 'broadcast',
          event: 'site_config_updated',
          payload: {
            config,
            featuredAlumni: config.featuredAlumni,
            timestamp: Date.now(),
          },
        });
      } catch {}
    }
  }

  private ensureHallOfFameAndSiteChannel() {
    if (this.hallOfFameChannel || !isSupabaseConfigured) return;

    try {
      this.hallOfFameChannel = supabase
        .channel('realtime:hall_of_fame_and_site_config', {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'site_settings' },
          (payload: any) => {
            const row = payload?.new;
            if (!row) return;
            const key = row.key || 'master_site_config';
            const val = row.value;
            if (val && typeof val === 'object') {
              this.siteSettingsListeners.forEach((cb) =>
                cb({
                  key,
                  value: val,
                  timestamp: Date.now(),
                })
              );
              if (key === 'master_site_config' && Array.isArray(val.featuredAlumni)) {
                this.hallOfFameListeners.forEach((cb) =>
                  cb({
                    eventType: (payload.eventType as any) || 'UPDATE',
                    featuredAlumni: val.featuredAlumni,
                    config: val,
                    timestamp: Date.now(),
                  })
                );
              } else if (key === 'hall_of_fame' && Array.isArray(val.members || val)) {
                const members = Array.isArray(val) ? val : val.members;
                this.hallOfFameListeners.forEach((cb) =>
                  cb({
                    eventType: (payload.eventType as any) || 'UPDATE',
                    featuredAlumni: members,
                    timestamp: Date.now(),
                  })
                );
              }
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'featured_alumni' },
          (payload: any) => {
            this.hallOfFameListeners.forEach((cb) =>
              cb({
                eventType: (payload.eventType as any) || 'UPDATE',
                featuredAlumni: payload.new ? [payload.new] : [],
                timestamp: Date.now(),
              })
            );
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'hall_of_fame' },
          (payload: any) => {
            this.hallOfFameListeners.forEach((cb) =>
              cb({
                eventType: (payload.eventType as any) || 'UPDATE',
                featuredAlumni: payload.new ? [payload.new] : [],
                timestamp: Date.now(),
              })
            );
          }
        )
        .on('broadcast', { event: 'site_config_updated' }, (msg: any) => {
          const payload = msg?.payload || msg;
          if (payload?.config && typeof payload.config === 'object') {
            this.siteSettingsListeners.forEach((cb) =>
              cb({
                key: 'master_site_config',
                value: payload.config,
                timestamp: payload.timestamp || Date.now(),
              })
            );
            if (Array.isArray(payload.config.featuredAlumni)) {
              this.hallOfFameListeners.forEach((cb) =>
                cb({
                  eventType: 'SYNC',
                  featuredAlumni: payload.config.featuredAlumni,
                  config: payload.config,
                  timestamp: payload.timestamp || Date.now(),
                })
              );
            }
          }
        })
        .on('broadcast', { event: 'hall_of_fame_updated' }, (msg: any) => {
          const payload = msg?.payload || msg;
          if (Array.isArray(payload?.featuredAlumni)) {
            this.hallOfFameListeners.forEach((cb) =>
              cb({
                eventType: 'SYNC',
                featuredAlumni: payload.featuredAlumni,
                timestamp: payload.timestamp || Date.now(),
              })
            );
          }
        })
        .subscribe((subscriptionStatus) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            this.setStatus('SUBSCRIBED');
          }
        });
    } catch (err) {
      console.warn('Realtime Hall of Fame & Site Settings subscription warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. FEED REALTIME CHANNEL (posts, comments, likes)
  // ---------------------------------------------------------------------------
  public subscribeToFeed(listener: (event: RealtimeFeedEvent) => void): () => void {
    this.feedListeners.add(listener);
    this.ensureFeedChannel();
    this.ensureUnifiedSseStream();

    return () => {
      this.feedListeners.delete(listener);
    };
  }

  public broadcastComment(comment: any) {
    if (!comment || !isSupabaseConfigured) return;
    this.ensureFeedChannel();
    if (this.feedChannel) {
      try {
        void this.feedChannel.send({
          type: 'broadcast',
          event: 'comment:inserted',
          payload: { comment, timestamp: Date.now() },
        });
      } catch {}
    }
  }

  public broadcastReply(postId: number, parentCommentId: number, reply: any) {
    if (!reply || !isSupabaseConfigured) return;
    this.ensureFeedChannel();
    if (this.feedChannel) {
      try {
        void this.feedChannel.send({
          type: 'broadcast',
          event: 'comment:replied',
          payload: { postId, parentCommentId, reply, timestamp: Date.now() },
        });
      } catch {}
    }
  }

  private ensureFeedChannel() {
    if (this.feedChannel || !isSupabaseConfigured) return;

    try {
      this.feedChannel = supabase
        .channel('realtime:quad_feed', {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'posts' },
          (payload) => {
            const event: RealtimeFeedEvent = {
              table: 'posts',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.feedListeners.forEach((cb) => cb(event));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'post_comments' },
          (payload) => {
            const event: RealtimeFeedEvent = {
              table: 'post_comments',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.feedListeners.forEach((cb) => cb(event));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'post_likes' },
          (payload) => {
            const event: RealtimeFeedEvent = {
              table: 'post_likes',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.feedListeners.forEach((cb) => cb(event));
          }
        )
        .on('broadcast', { event: 'comment:inserted' }, (msg: any) => {
          const payload = msg?.payload || msg;
          if (payload?.comment) {
            const event: RealtimeFeedEvent = {
              table: 'post_comments',
              eventType: 'INSERT',
              newRecord: payload.comment,
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          }
        })
        .on('broadcast', { event: 'comment:replied' }, (msg: any) => {
          const payload = msg?.payload || msg;
          if (payload?.reply) {
            const event: RealtimeFeedEvent = {
              table: 'post_comments',
              eventType: 'UPDATE',
              newRecord: {
                postId: payload.postId,
                post_id: payload.postId,
                parentCommentId: payload.parentCommentId,
                reply: payload.reply,
              },
              oldRecord: null,
            };
            this.feedListeners.forEach((cb) => cb(event));
          }
        })
        .subscribe((subscriptionStatus) => {
          if (subscriptionStatus === 'SUBSCRIBED') {
            this.setStatus('SUBSCRIBED');
          } else if (subscriptionStatus === 'TIMED_OUT') {
            this.setStatus('TIMED_OUT');
          } else if (subscriptionStatus === 'CLOSED') {
            this.setStatus('CLOSED');
          }
        });
    } catch (err) {
      console.warn('Realtime feed subscription warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. BLOOD NETWORK REALTIME CHANNEL (requests, donors, responses)
  // ---------------------------------------------------------------------------
  public subscribeToBloodNetwork(listener: (event: RealtimeBloodEvent) => void): () => void {
    this.bloodListeners.add(listener);
    this.ensureBloodChannel();

    return () => {
      this.bloodListeners.delete(listener);
    };
  }

  private ensureBloodChannel() {
    if (this.bloodChannel || !isSupabaseConfigured) return;

    try {
      this.bloodChannel = supabase
        .channel('realtime:blood_network')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blood_requests' },
          (payload) => {
            const event: RealtimeBloodEvent = {
              table: 'blood_requests',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.bloodListeners.forEach((cb) => cb(event));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blood_donors' },
          (payload) => {
            const event: RealtimeBloodEvent = {
              table: 'blood_donors',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.bloodListeners.forEach((cb) => cb(event));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blood_request_responses' },
          (payload) => {
            const event: RealtimeBloodEvent = {
              table: 'blood_request_responses',
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.bloodListeners.forEach((cb) => cb(event));
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime blood network subscription warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. USER NOTIFICATIONS REALTIME CHANNEL (targeted by recipient_id)
  // ---------------------------------------------------------------------------
  public subscribeToUserNotifications(
    userId: number,
    listener: (notification: any) => void
  ): () => void {
    if (!userId || userId <= 0) return () => {};

    let userSet = this.userNotificationListeners.get(userId);
    if (!userSet) {
      userSet = new Set();
      this.userNotificationListeners.set(userId, userSet);
    }
    userSet.add(listener);

    if (!this.userNotificationChannels.has(userId) && isSupabaseConfigured) {
      try {
        const channel = supabase
          .channel(`realtime:notifications:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `recipient_id=eq.${userId}`,
            },
            (payload) => {
              const notif = payload.new;
              const listeners = this.userNotificationListeners.get(userId);
              if (listeners) {
                listeners.forEach((cb) => cb(notif));
              }
            }
          )
          .subscribe();

        this.userNotificationChannels.set(userId, channel);
      } catch (err) {
        console.warn('Realtime notification subscription warning:', err);
      }
    }

    return () => {
      const listeners = this.userNotificationListeners.get(userId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.userNotificationListeners.delete(userId);
          const channel = this.userNotificationChannels.get(userId);
          if (channel) {
            channel.unsubscribe();
            this.userNotificationChannels.delete(userId);
          }
        }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 4. ALUMNI PROFILES & DIRECTORY REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  public subscribeToAlumni(listener: (event: RealtimeAlumniEvent) => void): () => void {
    this.alumniListeners.add(listener);
    this.ensureAlumniChannel();

    return () => {
      this.alumniListeners.delete(listener);
    };
  }

  private ensureAlumniChannel() {
    if (this.alumniChannel || !isSupabaseConfigured) return;

    try {
      this.alumniChannel = supabase
        .channel('realtime:alumni_profiles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'alumni_profiles' },
          (payload) => {
            const event: RealtimeAlumniEvent = {
              eventType: payload.eventType as any,
              newRecord: payload.new,
              oldRecord: payload.old,
            };
            this.alumniListeners.forEach((cb) => cb(event));
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime alumni subscription warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. OFFICIAL NOTICES REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  public subscribeToNotices(listener: (notice: any) => void): () => void {
    this.noticesListeners.add(listener);
    this.ensureNoticesChannel();

    return () => {
      this.noticesListeners.delete(listener);
    };
  }

  private ensureNoticesChannel() {
    if (this.noticesChannel || !isSupabaseConfigured) return;

    try {
      this.noticesChannel = supabase
        .channel('realtime:official_notices')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'official_notices' },
          (payload) => {
            this.noticesListeners.forEach((cb) => cb(payload));
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime notices subscription warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. GALLERY ALBUMS & PHOTOS REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  private galleryChannel: RealtimeChannel | null = null;
  private galleryListeners = new Set<(event: any) => void>();

  public subscribeToGallery(listener: (event: any) => void): () => void {
    this.galleryListeners.add(listener);
    if (!this.galleryChannel && isSupabaseConfigured) {
      try {
        this.galleryChannel = supabase
          .channel('realtime:gallery')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_albums' }, (payload) => {
            this.galleryListeners.forEach((cb) => cb({ table: 'gallery_albums', payload }));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_photos' }, (payload) => {
            this.galleryListeners.forEach((cb) => cb({ table: 'gallery_photos', payload }));
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime gallery subscription warning:', err);
      }
    }
    return () => {
      this.galleryListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // 7. MENTORSHIP REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  private mentorshipChannel: RealtimeChannel | null = null;
  private mentorshipListeners = new Set<(event: any) => void>();

  public subscribeToMentorship(listener: (event: any) => void): () => void {
    this.mentorshipListeners.add(listener);
    if (!this.mentorshipChannel && isSupabaseConfigured) {
      try {
        this.mentorshipChannel = supabase
          .channel('realtime:mentorship')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'mentorship_requests' }, (payload) => {
            this.mentorshipListeners.forEach((cb) => cb({ table: 'mentorship_requests', payload }));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'mentor_offers' }, (payload) => {
            this.mentorshipListeners.forEach((cb) => cb({ table: 'mentor_offers', payload }));
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime mentorship subscription warning:', err);
      }
    }
    return () => {
      this.mentorshipListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // 8. CAREERS REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  private careersChannel: RealtimeChannel | null = null;
  private careersListeners = new Set<(event: any) => void>();

  public subscribeToCareers(listener: (event: any) => void): () => void {
    this.careersListeners.add(listener);
    if (!this.careersChannel && isSupabaseConfigured) {
      try {
        this.careersChannel = supabase
          .channel('realtime:careers')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'career_opportunities' }, (payload) => {
            this.careersListeners.forEach((cb) => cb({ table: 'career_opportunities', payload }));
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime careers subscription warning:', err);
      }
    }
    return () => {
      this.careersListeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------------------
  // 9. EVENTS & REUNIONS REALTIME CHANNEL
  // ---------------------------------------------------------------------------
  public subscribeToEvents(listener: (event: any) => void): () => void {
    this.eventsListeners.add(listener);
    if (!this.eventsChannel && isSupabaseConfigured) {
      try {
        this.eventsChannel = supabase
          .channel('realtime:events')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => {
            this.eventsListeners.forEach((cb) => cb({ table: 'events', payload }));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'event_registrations' }, (payload) => {
            this.eventsListeners.forEach((cb) => cb({ table: 'event_registrations', payload }));
          })
          .subscribe();
      } catch (err) {
        console.warn('Realtime events subscription warning:', err);
      }
    }
    return () => {
      this.eventsListeners.delete(listener);
    };
  }

  private initSharedChannels() {
    this.ensureHallOfFameAndSiteChannel();
    this.ensureFeedChannel();
    this.ensureBloodChannel();
    this.ensureAlumniChannel();
    this.ensureNoticesChannel();
  }
}

export const realtimeManager = new SupabaseRealtimeManager();

