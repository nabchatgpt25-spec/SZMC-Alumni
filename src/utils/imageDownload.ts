/**
 * Utilities for downloading user-facing images as genuine high-quality JPG files.
 */

export function ensureJpgFilename(filename: string): string {
  const cleaned = filename.trim() || `szmc-image-${Date.now()}.jpg`;
  const withoutExt = cleaned.replace(/\.(png|jpe?g|webp|gif|bmp|avif)$/i, '');
  return `${withoutExt}.jpg`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImageElement(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

async function renderImageToJpgBlob(
  img: HTMLImageElement,
  quality: number
): Promise<Blob> {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error('Image has invalid dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Paint solid white base so transparent PNG/WebP images convert cleanly to JPG
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode JPG image'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Downloads any image URL (data URL, blob URL, same-origin, or remote URL)
 * encoded as a genuine high-quality JPG file.
 */
export async function downloadImageAsJpg(
  imageUrl: string,
  filename: string,
  quality = 0.96
): Promise<void> {
  const targetName = ensureJpgFilename(filename);

  // 1. Try direct CORS-safe image load -> canvas -> high-quality JPG
  try {
    const isLocalOrData =
      imageUrl.startsWith('data:') ||
      imageUrl.startsWith('blob:') ||
      imageUrl.startsWith('/');
    const img = await loadImageElement(imageUrl, !isLocalOrData);
    const jpgBlob = await renderImageToJpgBlob(img, quality);
    triggerBlobDownload(jpgBlob, targetName);
    return;
  } catch {
    // Fall through to fetch + object URL conversion
  }

  // 2. Try fetch -> object URL -> canvas -> high-quality JPG
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    if (res.ok) {
      const rawBlob = await res.blob();
      const objUrl = URL.createObjectURL(rawBlob);
      try {
        const img = await loadImageElement(objUrl, false);
        const jpgBlob = await renderImageToJpgBlob(img, quality);
        triggerBlobDownload(jpgBlob, targetName);
        return;
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
  } catch {
    // Fall through to direct link fallback if third-party host blocks CORS
  }

  // 3. Graceful fallback for strict third-party hosts
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = targetName;
  link.target = '_blank';
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
