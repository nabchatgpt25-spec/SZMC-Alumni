import { supabase } from '../lib/supabase';

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  posterBlob?: Blob;
  posterDataUrl?: string;
}

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
  'video/ogg',
];

const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Validates file type and size
 */
export function validateVideoFile(file: File): { isValid: boolean; error?: string } {
  const isAllowedByMime = ALLOWED_VIDEO_TYPES.includes(file.type);
  const isAllowedByExt = /\.(mp4|webm|mov|ogg)$/i.test(file.name);

  if (!isAllowedByMime && !isAllowedByExt) {
    return {
      isValid: false,
      error: 'Invalid video format. Please upload MP4, WebM, MOV, or OGG.',
    };
  }

  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      isValid: false,
      error: `Video exceeds the 100 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  return { isValid: true };
}

/**
 * Captures the first frame of a video file as a high-quality JPEG poster data URL & Blob
 */
export function extractVideoPoster(file: File | Blob): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      // Seek to 0.5s or 10% of duration to capture a representative thumbnail
      video.currentTime = Math.min(0.5, (video.duration || 0) / 4);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          return resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const posterDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            resolve({
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
              posterBlob: blob || undefined,
              posterDataUrl,
            });
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load video file for thumbnail generation.'));
    };
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read video file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a video file and its generated poster thumbnail to Supabase Storage
 */
export async function uploadVideoToStorage(
  file: File,
  userId: string,
  onProgress?: (percent: number) => void
): Promise<{ videoUrl: string; posterUrl?: string; duration: number }> {
  const validation = validateVideoFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  onProgress?.(10);

  // 1. Extract metadata and poster thumbnail
  let metadata: VideoMetadata | null = null;
  try {
    metadata = await extractVideoPoster(file);
  } catch {
    // Graceful fallback if client cannot render canvas preview
  }

  onProgress?.(30);

  const timestamp = Date.now();
  const fileExt = file.name.split('.').pop() || 'mp4';
  const videoPath = `posts/${userId}/video_${timestamp}.${fileExt}`;

  // 2. Upload video file to bucket 'post-media'
  const { error: videoError } = await supabase.storage
    .from('post-media')
    .upload(videoPath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'video/mp4',
    });

  if (videoError) {
    onProgress?.(65);
    try {
      const uploadRes = await fetch('/api/upload-video', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'video/mp4',
          'x-file-ext': fileExt,
          'x-user-id': userId,
        },
        body: file,
      });
      if (uploadRes.ok) {
        const uploadedJson = await uploadRes.json();
        if (uploadedJson?.url) {
          onProgress?.(100);
          return {
            videoUrl: uploadedJson.url,
            posterUrl: metadata?.posterDataUrl,
            duration: metadata?.duration || 0,
          };
        }
      }
    } catch {
      // Fall through to persistent Data URL
    }

    onProgress?.(85);
    const fallbackUrl = await fileToDataUrl(file);
    onProgress?.(100);
    return {
      videoUrl: fallbackUrl,
      posterUrl: metadata?.posterDataUrl,
      duration: metadata?.duration || 0,
    };
  }

  onProgress?.(70);

  const { data: videoPublicUrlData } = supabase.storage
    .from('post-media')
    .getPublicUrl(videoPath);

  let posterUrl: string | undefined;

  // 3. Upload thumbnail if available
  if (metadata?.posterBlob) {
    const posterPath = `posts/${userId}/poster_${timestamp}.jpg`;
    const { error: posterError } = await supabase.storage
      .from('post-media')
      .upload(posterPath, metadata.posterBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      });

    if (!posterError) {
      const { data: posterPublicUrlData } = supabase.storage
        .from('post-media')
        .getPublicUrl(posterPath);
      posterUrl = posterPublicUrlData.publicUrl;
    }
  }

  onProgress?.(100);

  return {
    videoUrl: videoPublicUrlData.publicUrl,
    posterUrl: posterUrl || metadata?.posterDataUrl,
    duration: metadata?.duration || 0,
  };
}
