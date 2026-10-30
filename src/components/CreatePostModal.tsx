import React, { useState } from 'react';
import { X, Image as ImageIcon, Link as LinkIcon, Loader2, Sparkles } from 'lucide-react';
import { extractFirstUrl, fetchLinkPreview } from '../services/linkPreviewService';
import { createPost } from '../services/postService';
import { LinkMetadata, PostItem } from '../types/post';
import { LinkPreview } from './LinkPreview';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: number;
  authorName?: string;
  authorAvatar?: string;
  onPostCreated: (post: PostItem) => void;
}

const CATEGORIES = [
  'General Update',
  'Tech & Innovation',
  'Professional Insights',
  'Job & Career Opportunities',
  'Campus Memories',
  'Blood Donation',
  'Emergency & Medical Aid',
  'Achievement',
  'Reunion',
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  authorId,
  authorName = 'SZMC Alumnus',
  authorAvatar = '/assets/aistudio/images__1__2778177d.png',
  onPostCreated,
}) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General Update');
  const [images, setImages] = useState<string[]>([]);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [urlMetadata, setUrlMetadata] = useState<LinkMetadata | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  if (!isOpen) return null;

  const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const firstUrl = extractFirstUrl(val);
    if (firstUrl && firstUrl !== detectedUrl) {
      setDetectedUrl(firstUrl);
      const meta = await fetchLinkPreview(firstUrl);
      setUrlMetadata(meta);
    } else if (!firstUrl) {
      setDetectedUrl(null);
      setUrlMetadata(null);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingImages(true);
    const fileList = Array.from(files);
    let loadedCount = 0;

    fileList.forEach((file) => {
      // Compress image client side using canvas to ensure fast posting and small payload
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxDimension = 1400;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setImages((prev) => [...prev, dataUrl]);
        }
        loadedCount += 1;
        if (loadedCount >= fileList.length) {
          setIsProcessingImages(false);
        }
      };

      img.onerror = () => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setImages((prev) => [...prev, reader.result as string]);
          }
          loadedCount += 1;
          if (loadedCount >= fileList.length) {
            setIsProcessingImages(false);
          }
        };
        reader.readAsDataURL(file);
      };

      img.src = objectUrl;
    });

    e.target.value = '';
  };

  const handlePublish = async () => {
    if (!content.trim() && images.length === 0 && !detectedUrl) return;

    setIsSubmitting(true);
    const result = await createPost({
      authorId,
      content,
      category,
      images,
      linked_url: detectedUrl || undefined,
      link_metadata: urlMetadata || undefined,
    });
    setIsSubmitting(false);

    if (result.success && result.post) {
      onPostCreated(result.post);
      onClose();
      setContent('');
      setImages([]);
      setDetectedUrl(null);
      setUrlMetadata(null);
    } else {
      alert(result.error || 'Failed to create post');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={authorAvatar}
              alt={authorName}
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Create Post</h3>
              <p className="text-[11px] text-slate-400">Share with SZMC Alumni network</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Text input */}
          <textarea
            rows={4}
            value={content}
            onChange={handleTextChange}
            placeholder="What's on your mind? Share medical insights, campus memories, or paste any YouTube / Facebook / web link..."
            className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Embedded Link Preview Banner */}
          {detectedUrl && urlMetadata && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" />
                  Embedded Link Detected
                </span>
                <button
                  onClick={() => {
                    setDetectedUrl(null);
                    setUrlMetadata(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Remove
                </button>
              </div>
              <LinkPreview url={detectedUrl} data={urlMetadata} />
            </div>
          )}

          {/* Attached Images Grid */}
          {images.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5 text-xs font-semibold text-slate-500">
                <span>{images.length} photo{images.length > 1 ? 's' : ''} attached</span>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-rose-500 hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs">
                    <img src={img} alt={`upload-${idx}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-black text-white rounded-full cursor-pointer transition-colors shadow-md"
                      title="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isProcessingImages && (
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 py-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Optimizing photos for fast posting...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-bold transition-colors">
            <ImageIcon className="w-4 h-4 text-emerald-500" />
            <span>Add Photos</span>
            <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          <button
            onClick={handlePublish}
            disabled={isSubmitting || isProcessingImages || (!content.trim() && images.length === 0 && !detectedUrl)}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Publish Post</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
