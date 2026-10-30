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

class SupabaseRealtimeManager {
  private feedChannel: RealtimeChannel | null = null;
  private bloodChannel: RealtimeChannel | null = null;
  private alumniChannel: RealtimeChannel | null = null;
  private noticesChannel: RealtimeChannel | null = null;
  private userNotificationChannels = new Map<number, RealtimeChannel>();

  private feedListeners = new Set<(event: RealtimeFeedEvent) => void>();
  private bloodListeners = new Set<(event: RealtimeBloodEvent) => void>();
  private alumniListeners = new Set<(event: RealtimeAlumniEvent) => void>();
  private noticesListeners = new Set<(event: any) => void>();
  private userNotificationListeners = new Map<number, Set<(notification: any) => void>>();

  private status: RealtimeStatus = isSupabaseConfigured ? 'CONNECTING' : 'OFFLINE';
  private statusListeners = new Set<(status: RealtimeStatus) => void>();

  constructor() {
    if (isSupabaseConfigured && typeof window !== 'undefined') {
      this.initSharedChannels();
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
  // 1. FEED REALTIME CHANNEL (posts, comments, likes)
  // ---------------------------------------------------------------------------
  public subscribeToFeed(listener: (event: RealtimeFeedEvent) => void): () => void {
    this.feedListeners.add(listener);
    this.ensureFeedChannel();

    return () => {
      this.feedListeners.delete(listener);
      if (this.feedListeners.size === 0 && this.feedChannel) {
        // Keep channel alive for low-latency re-subscriptions or clean up if idle
      }
    };
  }

  private ensureFeedChannel() {
    if (this.feedChannel || !isSupabaseConfigured) return;

    try {
      this.feedChannel = supabase
        .channel('realtime:quad_feed')
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

  private initSharedChannels() {
    this.ensureFeedChannel();
    this.ensureBloodChannel();
    this.ensureAlumniChannel();
    this.ensureNoticesChannel();
  }
}

export const realtimeManager = new SupabaseRealtimeManager();

