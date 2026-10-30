import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Image as ImageIcon,
  Video as VideoIcon,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  Layers,
  LayoutGrid,
  Rows,
  Eye,
  Sliders,
  Play,
  Film,
  Plus,
  Trash2,
  Globe,
  UploadCloud,
} from 'lucide-react';
import { extractFirstUrl, fetchLinkPreview } from '../services/linkPreviewService';
import { createPost } from '../services/postService';
import { LinkMetadata, PostItem } from '../types/post';
import { LinkPreview } from './LinkPreview';
import { PostMediaCarousel, CarouselTemplate } from './PostMediaCarousel';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: number;
  authorName?: string;
  authorAvatar?: string;
  initialTab?: 'text' | 'photo' | 'video' | 'link';
  initialImages?: string[];
  initialVideos?: string[];
  onPostCreated: (post: PostItem) => void;
}

const CATEGORIES = [
  'General Update',
  'Clinical Discussion',
  'Medical Research',
  'Campus Memories',
  'Career & Fellowship',
  'Blood Donation Aid',
  'Emergency Help',
  'Alumni Achievement',
  'Reunion & Events',
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  authorId,
  authorName = 'SZMC Alumnus',
  authorAvatar = '/assets/aistudio/images__1__2778177d.png',
  initialTab = 'text',
  initialImages = [],
  initialVideos = [],
  onPostCreated,
}) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General Update');
  const [images, setImages] = useState<string[]>(initialImages);
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [showVideoInputDrawer, setShowVideoInputDrawer] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [urlMetadata, setUrlMetadata] = useState<LinkMetadata | null>(null);
  const [layoutTemplate, setLayoutTemplate] = useState<CarouselTemplate>('carousel');
  const [activeViewMode, setActiveViewMode] = useState<'editor' | 'preview'>('editor');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialImages.length > 0) {
      setImages((prev) => Array.from(new Set([...prev, ...initialImages])));
    }
  }, [initialImages]);

  useEffect(() => {
    if (initialVideos.length > 0) {
      setVideos((prev) => Array.from(new Set([...prev, ...initialVideos])));
    }
  }, [initialVideos]);

  useEffect(() => {
    if (isOpen) {
      if (initialTab === 'photo') {
        setTimeout(() => fileInputRef.current?.click(), 80);
      } else if (initialTab === 'video') {
        setTimeout(() => videoFileInputRef.current?.click(), 80);
      }
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const totalMediaCount = images.length + videos.length;

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

    setIsProcessingMedia(true);
    const fileList = Array.from(files);
    let loadedCount = 0;

    fileList.forEach((file) => {
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setImages((prev) => [...prev, dataUrl]);
        }
        loadedCount += 1;
        if (loadedCount >= fileList.length) {
          setIsProcessingMedia(false);
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
            setIsProcessingMedia(false);
          }
        };
        reader.readAsDataURL(file);
      };

      img.src = objectUrl;
    });

    e.target.value = '';
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingMedia(true);
    const fileList = Array.from(files);
    let loaded = 0;

    fileList.forEach((file) => {
      if (file.size <= 20 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setVideos((prev) => [...prev, reader.result as string]);
          }
          loaded += 1;
          if (loaded >= fileList.length) {
            setIsProcessingMedia(false);
          }
        };
        reader.readAsDataURL(file);
      } else {
        const objectUrl = URL.createObjectURL(file);
        setVideos((prev) => [...prev, objectUrl]);
        loaded += 1;
        if (loaded >= fileList.length) {
          setIsProcessingMedia(false);
        }
      }
    });

    e.target.value = '';
  };

  const handleAddVideoUrl = () => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    setVideos((prev) => [...prev, trimmed]);
    setVideoUrlInput('');
    setShowVideoInputDrawer(false);
  };

  const handlePublish = async () => {
    if (!content.trim() && totalMediaCount === 0 && !detectedUrl) return;

    setIsSubmitting(true);
    const result = await createPost({
      authorId,
      content,
      category,
      images,
      videos,
      layout_template: layoutTemplate,
      linked_url: detectedUrl || undefined,
      link_metadata: urlMetadata || undefined,
    });
    setIsSubmitting(false);

    if (result.success && result.post) {
      onPostCreated(result.post);
      onClose();
      setContent('');
      setImages([]);
      setVideos([]);
      setDetectedUrl(null);
      setUrlMetadata(null);
    } else {
      alert(result.error || 'Failed to create post');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={authorAvatar}
              alt={authorName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20"
            />
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Create Post</h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Globe className="w-3 h-3 text-blue-500" />
                <span>Public to SZMC Alumni Network</span>
              </p>
            </div>
          </div>

          {/* Mode Switcher (Editor vs Live Preview) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveViewMode('editor')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeViewMode === 'editor'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Compose
            </button>
            <button
              type="button"
              onClick={() => setActiveViewMode('preview')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeViewMode === 'preview'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {activeViewMode === 'preview' ? (
            /* ========================================================= */
            /* INTERACTIVE LIVE PREVIEW MODE                             */
            /* ========================================================= */
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Interactive Live Preview ({layoutTemplate.toUpperCase()} Template)</span>
                </span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  Try clicking arrows & playing videos!
                </span>
              </div>

              {/* Mock Post Card */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center gap-3">
                  <img
                    src={authorAvatar}
                    alt={authorName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {authorName}
                    </h4>
                    <p className="text-[11px] text-slate-400">Just now · {category}</p>
                  </div>
                </div>

                {content && (
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                    {content}
                  </p>
                )}

                {/* Media Carousel Preview */}
                {totalMediaCount > 0 && (
                  <PostMediaCarousel
                    images={images}
                    videos={videos}
                    layout={layoutTemplate}
                  />
                )}

                {/* Embedded Link Preview */}
                {detectedUrl && urlMetadata && (
                  <LinkPreview url={detectedUrl} data={urlMetadata} />
                )}
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* EDITOR MODE                                               */
            /* ========================================================= */
            <>
              {/* Category Dropdown */}
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  Category:
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Text Input */}
              <textarea
                rows={3}
                value={content}
                onChange={handleTextChange}
                placeholder="What's on your mind? Share updates, clinical notes, or paste any video/web link..."
                className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[90px]"
              />

              {/* ========================================================= */}
              {/* CAROUSEL LAYOUT TEMPLATES PICKER (When 2+ media attached) */}
              {/* ========================================================= */}
              {totalMediaCount > 1 && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-500" />
                      <span>Carousel & Layout Template:</span>
                    </span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                      {totalMediaCount} items
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { id: 'carousel', label: 'Carousel Slider', icon: Sliders },
                      { id: 'grid', label: 'Grid Collage', icon: LayoutGrid },
                      { id: 'column', label: 'Column Stack', icon: Rows },
                      { id: 'hero', label: 'Hero Spotlight', icon: Film },
                    ].map((tpl) => {
                      const Icon = tpl.icon;
                      const isSelected = layoutTemplate === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setLayoutTemplate(tpl.id as CarouselTemplate)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs scale-102'
                              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-650'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{tpl.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Embedded Link Preview Banner */}
              {detectedUrl && urlMetadata && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" />
                      Attached Web Link
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

              {/* Video Link URL Drawer */}
              {showVideoInputDrawer && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                      <VideoIcon className="w-3.5 h-3.5" />
                      <span>Attach Video by Link (Facebook, YouTube, Reel, MP4)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowVideoInputDrawer(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={videoUrlInput}
                      onChange={(e) => setVideoUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddVideoUrl();
                        }
                      }}
                      placeholder="Paste Facebook video, YouTube URL, Instagram Reel, or MP4 link..."
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddVideoUrl}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Attach
                    </button>
                  </div>
                </div>
              )}

              {/* Media Thumbnails Grid (Photos + Videos) */}
              {totalMediaCount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>
                      {images.length} Photo{images.length !== 1 ? 's' : ''}
                      {videos.length > 0 && ` · ${videos.length} Video${videos.length !== 1 ? 's' : ''}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setImages([]);
                        setVideos([]);
                      }}
                      className="text-rose-500 hover:underline cursor-pointer"
                    >
                      Clear all media
                    </button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {/* Photos */}
                    {images.map((img, idx) => (
                      <div
                        key={`img-${idx}`}
                        className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 dark:border-slate-700 group shadow-xs"
                      >
                        <img
                          src={img}
                          alt={`Upload ${idx}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full cursor-pointer transition-colors"
                          title="Remove photo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {idx === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9.5px] font-bold">
                            Cover
                          </span>
                        )}
                      </div>
                    ))}

                    {/* Videos */}
                    {videos.map((vid, idx) => (
                      <div
                        key={`vid-${idx}`}
                        className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-purple-300 dark:border-purple-800 flex items-center justify-center text-white group shadow-xs"
                      >
                        <Film className="w-6 h-6 text-purple-400" />
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-purple-600/80 text-white text-[9.5px] font-bold">
                          Video
                        </span>
                        <button
                          type="button"
                          onClick={() => setVideos((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-rose-600 text-white rounded-full cursor-pointer transition-colors"
                          title="Remove video"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Quick Add Tile */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500 transition-all cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-[10px] font-bold">Add more</span>
                    </button>
                  </div>
                </div>
              )}

              {isProcessingMedia && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 py-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Optimizing media for instant playback...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
        <input
          ref={videoFileInputRef}
          type="file"
          multiple
          accept="video/*,video/mp4,video/webm,video/quicktime,video/x-matroska"
          onChange={handleVideoFileUpload}
          className="hidden"
        />

        {/* Footer: Facebook-style Photo, Video, Link action triggers */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer"
              title="Add Photos from Computer Storage"
            >
              <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Photo</span>
            </button>

            {/* Video Button - Opens computer storage directly to select downloaded video files */}
            <button
              type="button"
              onClick={() => videoFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 text-xs font-bold transition-colors cursor-pointer"
              title="Upload Downloaded Video from Computer Storage"
            >
              <VideoIcon className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Video</span>
            </button>

            {/* Link Button */}
            <button
              type="button"
              onClick={() => setShowVideoInputDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 text-xs font-bold transition-colors cursor-pointer"
              title="Attach Link"
            >
              <LinkIcon className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Link</span>
            </button>
          </div>

          <button
            onClick={handlePublish}
            disabled={
              isSubmitting ||
              isProcessingMedia ||
              (!content.trim() && totalMediaCount === 0 && !detectedUrl)
            }
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Publishing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Post</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
