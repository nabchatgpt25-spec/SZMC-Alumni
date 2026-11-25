import React, { useState, useEffect, useMemo } from 'react';
import {
  Image as ImageIcon,
  Calendar,
  Heart,
  Plus,
  Search,
  Filter,
  FolderPlus,
  Upload,
  Sparkles,
  MapPin,
  Users,
  Camera,
  Layers,
  ArrowRight,
  Trash2,
  AlertCircle,
  X
} from 'lucide-react';
import { GalleryAlbum, GalleryPhoto } from '../types';
import { INITIAL_ALBUMS } from '../data/galleryData';
import { AlbumShowcaseView } from './gallery/AlbumShowcaseView';
import { CreateAlbumModal } from './gallery/CreateAlbumModal';
import { UploadPhotosModal } from './gallery/UploadPhotosModal';
import { PhotoLightbox } from './gallery/PhotoLightbox';
import { ConfirmActionModal } from './common/ConfirmActionModal';
import { useAuth } from '../context/AuthContext';
import { getClientAuthHeaders, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchGalleryAlbumsFromDb,
  createGalleryAlbumInDb,
  addPhotoToGalleryAlbumInDb,
  createFeedPostInDb,
  deleteGalleryAlbumInDb,
  deleteGalleryPhotoInDb,
  toggleGalleryPhotoLikeInDb,
  updateGalleryAlbumInDb,
} from '../services/supabaseService';
import { realtimeManager } from '../services/supabaseRealtimeService';

const STORAGE_KEY = 'szmc_alumni_gallery_albums_v2';

export interface GalleryViewProps {
  initialAlbumId?: number | null;
  onBackToFeed?: () => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  initialAlbumId = null,
  onBackToFeed,
}) => {
  const { currentUser, isAdminUser } = useAuth();
  const [pendingDeleteAlbum, setPendingDeleteAlbum] = useState<{ id: number; title: string } | null>(null);

  const isSuperAdmin =
    isAdminUser || currentUser?.role === 'admin' || (currentUser as any)?.role === 'super_admin';

  // Ownership & Administration permission helpers
  const canDeleteAlbum = (album: GalleryAlbum): boolean => {
    if (isSuperAdmin) return true;
    if (!currentUser?.id) return false;
    if (album.createdById && Number(album.createdById) === Number(currentUser.id)) return true;
    if (
      album.createdBy &&
      currentUser.fullName &&
      album.createdBy.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase()
    ) {
      return true;
    }
    if (album.createdBy && (album.createdBy.includes('You') || album.createdBy.includes('Current User'))) {
      return true;
    }
    return false;
  };

  const canDeletePhoto = (photo: GalleryPhoto, album?: GalleryAlbum): boolean => {
    if (isSuperAdmin) return true;
    if (!currentUser?.id) return false;
    if (photo.uploaderId && Number(photo.uploaderId) === Number(currentUser.id)) return true;
    if (album?.createdById && Number(album.createdById) === Number(currentUser.id)) return true;
    if (
      photo.uploaderName &&
      currentUser.fullName &&
      photo.uploaderName.trim().toLowerCase() === currentUser.fullName.trim().toLowerCase()
    ) {
      return true;
    }
    if (photo.uploaderName && photo.uploaderName.includes('You')) {
      return true;
    }
    return false;
  };

  const [galleryError, setGalleryError] = useState<string | null>(null);

  // Load cached albums for instant first paint, then replace with live Supabase source of truth
  const [albums, setAlbums] = useState<GalleryAlbum[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_ALBUMS;
  });

  // Load from Supabase on mount & stay synced in real time across all users
  useEffect(() => {
    let isMounted = true;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const loadAlbums = () => {
      fetchGalleryAlbumsFromDb({ currentUserId: currentUser?.id })
        .then((dbAlbums) => {
          if (isMounted && Array.isArray(dbAlbums)) {
            setAlbums(dbAlbums);
          }
        })
        .catch((err) => {
          console.warn('GalleryView: Supabase albums fetch fallback:', err);
        });
    };

    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (isMounted) loadAlbums();
      }, 250);
    };

    loadAlbums();
    const unsubRealtime = realtimeManager.subscribeToGallery((evt) => {
      if (!isMounted) return;
      // Fast-path in-place update for live photo likes without flickering the grid
      if (
        evt?.action === 'PHOTO_LIKED' &&
        evt?.photoId &&
        typeof evt?.likesCount === 'number'
      ) {
        setAlbums((prev) =>
          prev.map((alb) => ({
            ...alb,
            photos: alb.photos.map((p) =>
              String(p.id) === String(evt.photoId)
                ? { ...p, likesCount: evt.likesCount }
                : p
            ),
          }))
        );
        return;
      }
      scheduleReload();
    });

    return () => {
      isMounted = false;
      if (reloadTimer) clearTimeout(reloadTimer);
      unsubRealtime();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
    } catch {
      // ignore
    }
  }, [albums]);

  // Selected Album for Showcase View (supports initialAlbumId from Feed "See Album" click)
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(() => {
    if (initialAlbumId) return initialAlbumId;
    if (typeof window !== 'undefined' && window.location.hash) {
      const h = window.location.hash.replace('#', '');
      if (h.startsWith('album-')) return Number(h.replace('album-', '')) || null;
      if (h.startsWith('gallery:')) return Number(h.replace('gallery:', '')) || null;
    }
    return null;
  });

  useEffect(() => {
    if (initialAlbumId) {
      setSelectedAlbumId(initialAlbumId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [initialAlbumId]);

  // Category and Search filter
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isCreateAlbumOpen, setIsCreateAlbumOpen] = useState<boolean>(false);
  const [isUploadPhotosOpen, setIsUploadPhotosOpen] = useState<boolean>(false);
  const [targetAlbumIdForUpload, setTargetAlbumIdForUpload] = useState<number | undefined>(undefined);

  // Lightbox state
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    albumId: number | null;
    currentIndex: number;
  }>({
    isOpen: false,
    albumId: null,
    currentIndex: 0,
  });

  // Slideshow auto-play state
  const [isPlayingSlideshow, setIsPlayingSlideshow] = useState<boolean>(false);

  // Active album being showcased (matches numeric or string IDs)
  const activeAlbum = useMemo(() => {
    if (!selectedAlbumId) return null;
    return (
      albums.find(
        (a) => a.id === selectedAlbumId || Number(a.id) === Number(selectedAlbumId)
      ) || null
    );
  }, [albums, selectedAlbumId]);

  // Active photo set for lightbox
  const activeLightboxPhotos = useMemo(() => {
    if (!lightboxState.albumId) return [];
    const alb = albums.find(
      (a) => a.id === lightboxState.albumId || Number(a.id) === Number(lightboxState.albumId)
    );
    return alb ? alb.photos : [];
  }, [albums, lightboxState.albumId]);

  // Slideshow timer effect
  useEffect(() => {
    if (!isPlayingSlideshow || !lightboxState.isOpen || activeLightboxPhotos.length === 0) return;

    const timer = setInterval(() => {
      setLightboxState((prev) => {
        const nextIndex =
          prev.currentIndex < activeLightboxPhotos.length - 1 ? prev.currentIndex + 1 : 0;
        return { ...prev, currentIndex: nextIndex };
      });
    }, 3500);

    return () => clearInterval(timer);
  }, [isPlayingSlideshow, lightboxState.isOpen, activeLightboxPhotos.length]);

  // Keep lightbox index safely within bounds if another user deletes photos in real time
  useEffect(() => {
    if (!lightboxState.isOpen) return;
    if (activeLightboxPhotos.length === 0) {
      setLightboxState((prev) => ({ ...prev, isOpen: false, currentIndex: 0 }));
      setIsPlayingSlideshow(false);
    } else if (lightboxState.currentIndex >= activeLightboxPhotos.length) {
      setLightboxState((prev) => ({
        ...prev,
        currentIndex: activeLightboxPhotos.length - 1,
      }));
    }
  }, [lightboxState.isOpen, lightboxState.currentIndex, activeLightboxPhotos.length]);

  // Filtered albums for grid
  const filteredAlbums = useMemo(() => {
    return albums.filter((album) => {
      if (activeCategory !== 'all') {
        if (activeCategory === 'sports') {
          if (album.category !== 'sports' && album.category !== 'cultural') return false;
        } else if (album.category !== activeCategory) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = album.title.toLowerCase().includes(q);
        const matchDesc = album.description?.toLowerCase().includes(q) || false;
        const matchLoc = album.location?.toLowerCase().includes(q) || false;
        if (!matchTitle && !matchDesc && !matchLoc) {
          return false;
        }
      }
      return true;
    });
  }, [albums, activeCategory, searchQuery]);

  // Aggregate Metrics
  const totalPhotosCount = useMemo(() => {
    return albums.reduce((acc, a) => acc + (a.photos?.length || a.photosCount || 0), 0);
  }, [albums]);

  // Handlers
  const handleCreateAlbum = async (newAlbum: GalleryAlbum) => {
    setGalleryError(null);
    const albumWithUser: GalleryAlbum = {
      ...newAlbum,
      createdById: newAlbum.createdById || currentUser?.id,
      createdBy: newAlbum.createdBy || currentUser?.fullName || 'SZMC Alumnus',
    };

    // 1. Optimistic UI insert
    setAlbums((prev) => [albumWithUser, ...prev]);
    setSelectedAlbumId(albumWithUser.id);

    let realAlbumId: number | null = null;
    try {
      const created = await createGalleryAlbumInDb({
        title: albumWithUser.title,
        description: albumWithUser.description,
        category: albumWithUser.category,
        eventDateLabel: albumWithUser.date,
        location: albumWithUser.location,
        batchYear: albumWithUser.batchYear,
        coverUrl: albumWithUser.coverUrl,
        createdById: albumWithUser.createdById,
        createdBy: albumWithUser.createdBy,
      });

      if (created?.albumId) {
        realAlbumId = created.albumId;
        setAlbums((prev) =>
          prev.map((a) => {
            if (a.id !== albumWithUser.id) return a;
            const reconciledPhotos = a.photos.map((p, idx) =>
              idx === 0 && created.coverPhotoId
                ? { ...p, id: created.coverPhotoId, albumId: created.albumId }
                : { ...p, albumId: created.albumId }
            );
            return { ...a, id: created.albumId, photos: reconciledPhotos };
          })
        );
        setSelectedAlbumId(created.albumId);
      } else if (isSupabaseConfigured) {
        setAlbums((prev) => prev.filter((a) => a.id !== albumWithUser.id));
        setSelectedAlbumId(null);
        setGalleryError('Could not save the new album to Supabase. Please make sure you are signed in and try again.');
        return;
      }
    } catch (err) {
      console.warn('createGalleryAlbumInDb fallback:', err);
      if (isSupabaseConfigured) {
        setAlbums((prev) => prev.filter((a) => a.id !== albumWithUser.id));
        setSelectedAlbumId(null);
        setGalleryError('Could not save the new album to Supabase. Please try again.');
        return;
      }
    }

    // 2. Automatically publish ONE public feed post with "See Album" action (no duplicates)
    try {
      const targetAlbumId = realAlbumId || albumWithUser.id;
      const photoUrls = albumWithUser.photos?.map((p) => p.url).filter(Boolean) || [];
      const imagesToPost = photoUrls.length > 0 ? photoUrls : [albumWithUser.coverUrl];

      const postContent = `📸 Added a new photo album: "${albumWithUser.title}"\n\n${
        albumWithUser.description ? albumWithUser.description + '\n\n' : ''
      }Click "See Album" below to browse the complete album photographs in the gallery!\n[szmc_album_ref:${targetAlbumId}]`;

      let postedViaApi = false;
      try {
        const authHeaders = await getClientAuthHeaders();
        const resp = await fetch('/api/posts', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            author_id: currentUser?.id,
            content: postContent,
            category: 'Reunion',
            images: imagesToPost,
            albumId: targetAlbumId,
            albumTitle: albumWithUser.title,
            albumCategory: albumWithUser.category,
          }),
        });
        postedViaApi = resp.ok;
      } catch (postFetchErr) {
        console.warn('API /api/posts album post error:', postFetchErr);
      }

      // Only fall back to direct Supabase feed insert if the API route failed
      if (!postedViaApi) {
        await createFeedPostInDb({
          content: postContent,
          category: 'Reunion',
          images: imagesToPost,
        }).catch((sbErr) => console.warn('Supabase createFeedPostInDb notice:', sbErr));
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('szmc:album-posted', {
            detail: {
              albumId: targetAlbumId,
              albumTitle: albumWithUser.title,
              category: albumWithUser.category,
              coverUrl: albumWithUser.coverUrl,
              images: imagesToPost,
            },
          })
        );
        window.dispatchEvent(new CustomEvent('szmc:refresh-feed'));
      }
    } catch (autoPostErr) {
      console.warn('Auto-create public feed post for album notice:', autoPostErr);
    }
  };

  const handleUploadPhotos = async (albumId: number, newPhotos: GalleryPhoto[]) => {
    setGalleryError(null);

    // 1. Optimistic insert
    setAlbums((prev) =>
      prev.map((alb) => {
        if (alb.id === albumId) {
          const updatedPhotos = [...newPhotos, ...alb.photos];
          return {
            ...alb,
            photos: updatedPhotos,
            photosCount: updatedPhotos.length,
          };
        }
        return alb;
      })
    );

    // 2. Persist each photo to Supabase & reconcile real DB UUIDs immediately
    const idReconciliation = new Map<string, string>();
    const failedTempIds = new Set<string>();

    for (const photo of newPhotos) {
      try {
        const realPhotoId = await addPhotoToGalleryAlbumInDb({
          albumId,
          url: photo.url,
          storagePath: photo.storagePath,
          caption: photo.caption,
          batchYear: photo.batchYear,
          tags: photo.tags,
          mediaType: photo.mediaType,
          fileSize: photo.fileSize,
          uploaderId: photo.uploaderId || currentUser?.id,
          uploaderName: photo.uploaderName || currentUser?.fullName || 'SZMC Alumnus',
          skipBroadcast: true,
        });

        if (realPhotoId) {
          idReconciliation.set(photo.id, realPhotoId);
        } else if (isSupabaseConfigured) {
          failedTempIds.add(photo.id);
        }
      } catch (err) {
        console.warn('addPhotoToGalleryAlbumInDb error:', err);
        if (isSupabaseConfigured) {
          failedTempIds.add(photo.id);
        }
      }
    }

    // Reconcile DB IDs and drop any failed optimistic entries
    if (idReconciliation.size > 0 || failedTempIds.size > 0) {
      setAlbums((prev) =>
        prev.map((alb) => {
          if (alb.id !== albumId) return alb;
          const reconciled = alb.photos
            .filter((p) => !failedTempIds.has(p.id))
            .map((p) => {
              const realId = idReconciliation.get(p.id);
              return realId ? { ...p, id: realId } : p;
            });
          return {
            ...alb,
            photos: reconciled,
            photosCount: reconciled.length,
          };
        })
      );
    }

    if (idReconciliation.size > 0) {
      void realtimeManager.broadcastGalleryUpdate('PHOTO_ADDED', {
        albumId,
        count: idReconciliation.size,
      });
    }

    if (failedTempIds.size > 0) {
      setGalleryError(
        `${failedTempIds.size} item${failedTempIds.size === 1 ? '' : 's'} could not be saved to Supabase. Please make sure you are signed in.`
      );
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    setGalleryError(null);
    const previousAlbums = albums;
    const previousSelectedId = selectedAlbumId;

    // Optimistic removal from state
    setAlbums((prev) => prev.filter((a) => a.id !== albumId && Number(a.id) !== Number(albumId)));
    if (selectedAlbumId === albumId || Number(selectedAlbumId) === Number(albumId)) {
      setSelectedAlbumId(null);
      if (typeof window !== 'undefined' && window.location.hash.startsWith('#album-')) {
        window.location.hash = 'gallery';
      }
    }

    try {
      const result = await deleteGalleryAlbumInDb(
        albumId,
        currentUser?.id,
        isAdminUser || currentUser?.role === 'admin'
      );
      if (!result.success) {
        setAlbums(previousAlbums);
        setSelectedAlbumId(previousSelectedId);
        setGalleryError(result.error || 'Could not delete album from Supabase.');
      }
    } catch (err: any) {
      setAlbums(previousAlbums);
      setSelectedAlbumId(previousSelectedId);
      setGalleryError(err?.message || 'Could not delete album from Supabase.');
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    setGalleryError(null);
    const previousAlbums = albums;
    let foundAlbumId: number | undefined;

    setAlbums((prev) =>
      prev.map((alb) => {
        const hasPhoto = alb.photos.some((p) => String(p.id) === String(photoId));
        if (hasPhoto) {
          foundAlbumId = alb.id;
          const remaining = alb.photos.filter((p) => String(p.id) !== String(photoId));
          return {
            ...alb,
            photos: remaining,
            photosCount: remaining.length,
            coverUrl:
              alb.photos[0]?.id === photoId && remaining[0] ? remaining[0].url : alb.coverUrl,
          };
        }
        return alb;
      })
    );

    if (lightboxState.isOpen) {
      if (activeLightboxPhotos.length <= 1) {
        setLightboxState((prev) => ({ ...prev, isOpen: false }));
      } else {
        setLightboxState((prev) => ({
          ...prev,
          currentIndex: Math.max(0, Math.min(prev.currentIndex, activeLightboxPhotos.length - 2)),
        }));
      }
    }

    try {
      const result = await deleteGalleryPhotoInDb(
        photoId,
        foundAlbumId || lightboxState.albumId || undefined,
        currentUser?.id,
        isAdminUser || currentUser?.role === 'admin'
      );
      if (!result.success) {
        setAlbums(previousAlbums);
        setGalleryError(result.error || 'Could not delete photo from Supabase.');
      }
    } catch (err: any) {
      setAlbums(previousAlbums);
      setGalleryError(err?.message || 'Could not delete photo from Supabase.');
    }
  };

  const handleToggleLike = async (photoId: string) => {
    let targetAlbumId: number | undefined;
    let nextLiked = true;

    setAlbums((prev) =>
      prev.map((alb) => ({
        ...alb,
        photos: alb.photos.map((p) => {
          if (String(p.id) === String(photoId)) {
            targetAlbumId = alb.id;
            nextLiked = !p.likedByMe;
            return {
              ...p,
              likedByMe: nextLiked,
              likesCount: Math.max(0, (p.likesCount || 0) + (nextLiked ? 1 : -1)),
            };
          }
          return p;
        }),
      }))
    );

    const res = await toggleGalleryPhotoLikeInDb({
      photoId,
      albumId: targetAlbumId,
      liked: nextLiked,
      userId: currentUser?.id,
    });

    if (res.success && typeof res.likesCount === 'number') {
      setAlbums((prev) =>
        prev.map((alb) => ({
          ...alb,
          photos: alb.photos.map((p) =>
            String(p.id) === String(photoId)
              ? {
                  ...p,
                  likesCount: res.likesCount!,
                  likedByMe: typeof res.likedByMe === 'boolean' ? res.likedByMe : nextLiked,
                }
              : p
          ),
        }))
      );
    }
  };

  const handleUpdateAlbum = async (
    albumId: number,
    updates: {
      title: string;
      description: string;
      category: GalleryAlbum['category'];
      eventDateLabel: string;
      location: string;
    }
  ) => {
    setGalleryError(null);
    const previousAlbums = albums;
    setAlbums((prev) =>
      prev.map((alb) =>
        alb.id === albumId
          ? {
              ...alb,
              title: updates.title.trim() || alb.title,
              description: updates.description.trim(),
              category: updates.category,
              date: updates.eventDateLabel.trim() || alb.date,
              location: updates.location.trim(),
            }
          : alb
      )
    );

    const res = await updateGalleryAlbumInDb(albumId, updates);
    if (!res.success) {
      setAlbums(previousAlbums);
      setGalleryError(res.error || 'Could not update album in Supabase.');
    }
  };

  const openUploadModalForAlbum = (albumId?: number) => {
    setTargetAlbumIdForUpload(albumId);
    setIsUploadPhotosOpen(true);
  };

  const startAlbumSlideshow = (albumId: number) => {
    setLightboxState({
      isOpen: true,
      albumId,
      currentIndex: 0,
    });
    setIsPlayingSlideshow(true);
  };

  // If viewing an album showcase:
  if (activeAlbum) {
    return (
      <>
        {galleryError && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{galleryError}</span>
            </div>
            <button
              type="button"
              onClick={() => setGalleryError(null)}
              className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <AlbumShowcaseView
          album={activeAlbum}
          onBack={() => {
            setSelectedAlbumId(null);
            if (typeof window !== 'undefined' && window.location.hash.startsWith('#album-')) {
              window.location.hash = 'gallery';
            }
          }}
          onBackToFeed={onBackToFeed}
          onOpenLightbox={(index) => {
            setLightboxState({
              isOpen: true,
              albumId: activeAlbum.id,
              currentIndex: index,
            });
            setIsPlayingSlideshow(false);
          }}
          onToggleLike={handleToggleLike}
          onRequestUpload={(albumId) => openUploadModalForAlbum(albumId)}
          onStartSlideshow={() => startAlbumSlideshow(activeAlbum.id)}
          canDeleteAlbum={canDeleteAlbum(activeAlbum)}
          canDeletePhoto={(photo) => canDeletePhoto(photo, activeAlbum)}
          onDeleteAlbum={handleDeleteAlbum}
          onDeletePhoto={handleDeletePhoto}
          onUpdateAlbum={handleUpdateAlbum}
        />

        {/* Lightbox */}
        <PhotoLightbox
          photos={activeLightboxPhotos}
          currentIndex={lightboxState.currentIndex}
          isOpen={lightboxState.isOpen}
          onClose={() => {
            setLightboxState((prev) => ({ ...prev, isOpen: false }));
            setIsPlayingSlideshow(false);
          }}
          onNavigate={(newIndex) =>
            setLightboxState((prev) => ({ ...prev, currentIndex: newIndex }))
          }
          onToggleLike={handleToggleLike}
          isPlayingSlideshow={isPlayingSlideshow}
          onToggleSlideshow={() => setIsPlayingSlideshow((prev) => !prev)}
          canDeleteCurrentPhoto={Boolean(
            activeLightboxPhotos[lightboxState.currentIndex] &&
              canDeletePhoto(activeLightboxPhotos[lightboxState.currentIndex], activeAlbum)
          )}
          onDeletePhoto={handleDeletePhoto}
        />

        {/* Upload Modal */}
        <UploadPhotosModal
          isOpen={isUploadPhotosOpen}
          onClose={() => setIsUploadPhotosOpen(false)}
          albums={albums}
          selectedAlbumId={targetAlbumIdForUpload || activeAlbum.id}
          onUploadPhotos={handleUploadPhotos}
          onRequestCreateAlbum={() => {
            setIsUploadPhotosOpen(false);
            setIsCreateAlbumOpen(true);
          }}
        />

        {/* Create Album Modal */}
        <CreateAlbumModal
          isOpen={isCreateAlbumOpen}
          onClose={() => setIsCreateAlbumOpen(false)}
          onCreateAlbum={handleCreateAlbum}
        />
      </>
    );
  }

  // Otherwise: Main Album Gallery Grid View
  return (
    <div className="space-y-6">
      {galleryError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{galleryError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGalleryError(null)}
            className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* ------------------------------------------------------------- */}
      {/* 1. Page Header & Actions */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
            <ImageIcon className="w-4 h-4" />
            <span>Alumni Visual Archives</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight mt-0.5">
            Campus & Alumni Gallery
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cherished moments, convocation memories, and alumni reunions across the years.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap">
          <button
            type="button"
            onClick={() => setIsCreateAlbumOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-2xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
          >
            <FolderPlus className="w-4 h-4 text-blue-600" />
            <span>+ Make Album</span>
          </button>

          <button
            type="button"
            onClick={() => openUploadModalForAlbum()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-xs transition-all cursor-pointer scale-100 hover:scale-102"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Photos</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. Gallery Summary Metrics */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Curated Albums
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-50">
            {albums.length}
          </div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
            Reunions & Archives
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Memories
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
            {totalPhotosCount}+
          </div>
          <div className="text-[10px] text-slate-500 font-semibold">
            High-Resolution Photos
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Batches Covered
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            Batch 01–38
          </div>
          <div className="text-[10px] text-slate-500 font-semibold">
            All Generations
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Latest Archive
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-50 truncate pt-1">
            {albums[0]?.title || 'SZMC Archives'}
          </div>
          <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate">
            {albums[0]?.date || 'Updated recently'}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. Category Filter Tabs & Search Bar */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Albums' },
            { id: 'reunion', label: 'Reunions' },
            { id: 'academic', label: 'Conferences & CME' },
            { id: 'campus', label: 'Campus Life' },
            { id: 'convocation', label: 'Convocations' },
            { id: 'sports', label: 'Sports & Cultural' },
          ].map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search albums..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. Albums Showcase Grid */}
      {/* ------------------------------------------------------------- */}
      {filteredAlbums.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ImageIcon className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
            No matching photo albums found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Try clearing your search or category filter, or start a new album for your batch memories.
          </p>
          <div className="pt-1 flex items-center justify-center gap-2">
            {(searchQuery || activeCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCreateAlbumOpen(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
            >
              + Create New Album
            </button>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5 sm:gap-6">
        {filteredAlbums.map((album) => {
          const previewPhotos = album.photos.slice(0, 4);

          return (
            <div
              key={album.id}
              onClick={() => setSelectedAlbumId(album.id)}
              className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-800 transition-all duration-300 cursor-pointer flex flex-col"
            >
              {/* Cover Image & Overlay */}
              <div className="h-60 sm:h-64 relative overflow-hidden bg-slate-950">
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-500 opacity-90 group-hover:opacity-100"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                {/* Top Badge: Photo Count, Category & Delete Action */}
                <div className="absolute top-3.5 inset-x-4 flex items-center justify-between">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-blue-600/90 text-white backdrop-blur-md shadow-xs flex items-center gap-1.5">
                    <Camera className="w-3 h-3" />
                    <span>{album.photos.length || album.photosCount} Photos</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-black/50 text-slate-200 backdrop-blur-md border border-white/20">
                      {album.category}
                    </span>

                    {canDeleteAlbum(album) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteAlbum({ id: album.id, title: album.title });
                        }}
                        title="Delete album (Owner or Admin)"
                        className="w-7 h-7 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-md hover:scale-105"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom Title & Details */}
                <div className="absolute bottom-3 left-4 right-4 text-white space-y-1">
                  <h3 className="font-extrabold text-lg sm:text-xl leading-snug group-hover:text-blue-300 transition-colors">
                    {album.title}
                  </h3>
                  {album.location && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-300">
                      <MapPin className="w-3 h-3 text-rose-400" />
                      <span className="truncate">{album.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo Peek Thumbnails */}
              <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center -space-x-2 overflow-hidden">
                  {previewPhotos.map((photo, i) => (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt="Thumbnail preview"
                      className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900 object-cover"
                    />
                  ))}
                  {album.photos.length > 4 && (
                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-200 text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                      +{album.photos.length - 4}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openUploadModalForAlbum(album.id);
                  }}
                  className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-3 h-3 text-blue-600" />
                  <span>Add Photos</span>
                </button>
              </div>

              {/* Footer Bar */}
              <div className="p-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mt-auto">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{album.date}</span>
                </div>

                <span className="text-blue-600 dark:text-blue-400 font-extrabold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>View Album</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. Modals */}
      {/* ------------------------------------------------------------- */}
      <CreateAlbumModal
        isOpen={isCreateAlbumOpen}
        onClose={() => setIsCreateAlbumOpen(false)}
        onCreateAlbum={handleCreateAlbum}
      />

      <UploadPhotosModal
        isOpen={isUploadPhotosOpen}
        onClose={() => setIsUploadPhotosOpen(false)}
        albums={albums}
        selectedAlbumId={targetAlbumIdForUpload}
        onUploadPhotos={handleUploadPhotos}
        onRequestCreateAlbum={() => {
          setIsUploadPhotosOpen(false);
          setIsCreateAlbumOpen(true);
        }}
      />

      <ConfirmActionModal
        isOpen={Boolean(pendingDeleteAlbum)}
        title="Delete Album"
        message={
          pendingDeleteAlbum
            ? `Are you sure you want to delete the album "${pendingDeleteAlbum.title}" and all its photos? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Album"
        onConfirm={() => {
          if (pendingDeleteAlbum) {
            void handleDeleteAlbum(pendingDeleteAlbum.id);
          }
          setPendingDeleteAlbum(null);
        }}
        onCancel={() => setPendingDeleteAlbum(null)}
      />
    </div>
  );
};

export default GalleryView;
