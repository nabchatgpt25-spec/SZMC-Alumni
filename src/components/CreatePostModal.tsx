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
  BarChart3,
  AtSign,
} from 'lucide-react';
import { extractFirstUrl, fetchLinkPreview } from '../services/linkPreviewService';
import { createPost } from '../services/postService';
import { uploadVideoToStorage, VideoMetadata } from '../services/videoUploadService';
import { LinkMetadata, PostItem, PostAudience } from '../types/post';
import { LinkPreview } from './LinkPreview';
import { PostMediaCarousel, CarouselTemplate } from './PostMediaCarousel';
import { VideoUploadPicker } from './feed/VideoUploadPicker';
import { POST_AUDIENCE_OPTIONS } from '../services/feedRankingService';
import { QUAD_POST_CATEGORIES } from './community/quadConstants';
import { searchAlumniForMention } from '../services/richInteractionsService';
import type { MentionCandidate } from '../services/richInteractionsUtils';
import { VerifiedAvatar } from './verification/VerifiedAvatar';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorId: number;
  authorName?: string;
  authorAvatar?: string;
  authorVerified?: boolean;
  authorProfileCompleted?: boolean;
  authorBatchYear?: number;
  canMarkEditorial?: boolean;
  initialTab?: 'text' | 'photo' | 'video' | 'link';
  initialImages?: string[];
  initialVideos?: string[];
  onPostCreated: (post: PostItem) => void;
}

const CATEGORIES = QUAD_POST_CATEGORIES.filter((c) => c !== 'All');

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  authorId,
  authorName = 'SZMC Alumnus',
  authorAvatar = '/assets/aistudio/images__1__2778177d.png',
  authorVerified = false,
  authorProfileCompleted = false,
  authorBatchYear,
  canMarkEditorial = false,
  initialTab = 'text',
  initialImages = [],
  initialVideos = [],
  onPostCreated,
}) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('General Discussion');
  const [audience, setAudience] = useState<PostAudience>('public');
  const [postToMyBatchLounge, setPostToMyBatchLounge] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
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
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [showVideoUploadPicker, setShowVideoUploadPicker] = useState(initialTab === 'video');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedVideoPreviewUrl, setSelectedVideoPreviewUrl] = useState<string | null>(null);

  // Phase 5: Inline Poll Builder & @Mentions
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionCandidate[]>([]);
  const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);

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
        setShowVideoUploadPicker(true);
      }
    }
  }, [isOpen, initialTab]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const totalMediaCount = images.length + videos.length;

  const handleTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    // Detect active @mention query at the end of the text
    const mentionMatch = val.match(/(?:^|\s)@([A-Za-z][A-Za-z0-9.\s]{0,24})$/);
    if (mentionMatch && mentionMatch[1].trim().length >= 1) {
      const candidates = await searchAlumniForMention(mentionMatch[1].trim());
      setMentionSuggestions(candidates);
    } else if (mentionSuggestions.length > 0) {
      setMentionSuggestions([]);
    }

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

  const handleInsertMention = (candidate: MentionCandidate) => {
    setContent((prev) =>
      prev.replace(/(^|\s)@([A-Za-z][A-Za-z0-9.\s]{0,24})$/, `$1@[${candidate.fullName}] `)
    );
    setMentionedUserIds((prev) => Array.from(new Set([...prev, candidate.id])));
    setMentionSuggestions([]);
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

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingMedia(true);
    setUploadProgress(10);
    const fileList = Array.from(files);

    for (const file of fileList) {
      try {
        const uploaded = await uploadVideoToStorage(file, String(authorId), (pct) => {
          setUploadProgress(pct);
        });
        setVideos((prev) => [...prev, uploaded.videoUrl]);
      } catch (err: any) {
        setErrorMessage(err.message || 'Video upload failed.');
      }
    }

    setIsProcessingMedia(false);
    setUploadProgress(0);
    e.target.value = '';
  };

  const handlePickerVideoSelected = async (file: File, _metadata: VideoMetadata) => {
    setSelectedVideoFile(file);
    const objUrl = URL.createObjectURL(file);
    setSelectedVideoPreviewUrl(objUrl);
    setIsProcessingMedia(true);
    setUploadProgress(10);
    try {
      const uploaded = await uploadVideoToStorage(file, String(authorId), (pct) => {
        setUploadProgress(pct);
      });
      setVideos((prev) => Array.from(new Set([...prev, uploaded.videoUrl])));
    } catch (err: any) {
      setErrorMessage(err.message || 'Video upload failed.');
    } finally {
      setIsProcessingMedia(false);
      setUploadProgress(0);
    }
  };

  const handlePickerClearVideo = () => {
    if (selectedVideoPreviewUrl) {
      URL.revokeObjectURL(selectedVideoPreviewUrl);
    }
    setSelectedVideoFile(null);
    setSelectedVideoPreviewUrl(null);
  };

  const handleAddVideoUrl = () => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    const normalized =
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:')
        ? trimmed
        : `https://${trimmed}`;
    setVideos((prev) => [...prev, normalized]);
    setVideoUrlInput('');
    setShowVideoInputDrawer(false);
  };

  const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
  const hasValidPoll = showPollBuilder && pollQuestion.trim().length > 0 && validPollOptions.length >= 2;

  const handlePublish = async () => {
    if (!content.trim() && totalMediaCount === 0 && !detectedUrl && !hasValidPoll) return;

    setErrorMessage(null);
    setIsSubmitting(true);
    const result = await createPost({
      authorId,
      content: content.trim() || (hasValidPoll ? pollQuestion.trim() : ''),
      category,
      communityCategory: category,
      audience,
      isOfficial: canMarkEditorial && isOfficial,
      isFeatured: canMarkEditorial && isFeatured,
      priorityLevel:
        category === 'Blood Request'
          ? 3
          : canMarkEditorial && isOfficial
          ? 2
          : canMarkEditorial && isFeatured
          ? 1
          : 0,
      batchLoungeYear: postToMyBatchLounge && authorBatchYear ? authorBatchYear : null,
      mentionedUserIds,
      poll: hasValidPoll
        ? { question: pollQuestion.trim(), options: validPollOptions }
        : null,
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
      setIsOfficial(false);
      setIsFeatured(false);
      setPostToMyBatchLounge(false);
      setShowPollBuilder(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setMentionedUserIds([]);
      setMentionSuggestions([]);
      setErrorMessage(null);
    } else {
      setErrorMessage(result.error || 'Failed to publish post to database. Please check connection and try again.');
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[92vh]">
        {/* Mobile Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-0.5 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <VerifiedAvatar
              src={authorAvatar}
              alt={authorName}
              verified={authorVerified}
              profileCompleted={authorProfileCompleted}
              size="sm"
              imgClassName="w-9 h-9"
              unverifiedClassName="rounded-full ring-2 ring-blue-500/20"
            />
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">Create Post</h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="truncate">
                  {POST_AUDIENCE_OPTIONS.find((a) => a.id === audience)?.label || 'Public (The Quad)'}
                </span>
              </p>
            </div>
          </div>

          {/* Mode Switcher (Editor vs Live Preview) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setActiveViewMode('editor')}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
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
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="min-w-[44px] min-h-[44px] -mr-1.5 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer transition-colors shrink-0 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-start justify-between gap-2">
              <span className="font-semibold leading-relaxed">{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-200 font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}

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

              {/* Live Post Preview Card */}
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
              {/* Audience & 8-Category Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Audience
                  </label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as PostAudience)}
                    className="w-full min-h-[38px] px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {POST_AUDIENCE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Community Space & Editorial Placement Controls */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                {authorBatchYear && authorBatchYear >= 1 && authorBatchYear <= 35 && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={postToMyBatchLounge}
                      onChange={(e) => setPostToMyBatchLounge(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Also publish in SZMC-{String(authorBatchYear).padStart(2, '0')} Lounge
                    </span>
                  </label>
                )}

                {canMarkEditorial && (
                  <>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isOfficial}
                        onChange={(e) => {
                          setIsOfficial(e.target.checked);
                          if (e.target.checked) setCategory('Announcement');
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-blue-700 dark:text-blue-300">
                        Official Announcement
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isFeatured}
                        onChange={(e) => setIsFeatured(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        Featured Post
                      </span>
                    </label>
                  </>
                )}
              </div>

              {/* Text Input with @mention autocomplete */}
              <div className="relative">
                <textarea
                  rows={3}
                  value={content}
                  onChange={handleTextChange}
                  placeholder="Share updates, clinical notes, paste a link, or type @name to mention an alumnus..."
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[90px]"
                />
                {mentionSuggestions.length > 0 && (
                  <div className="mt-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                    <div className="px-3 py-1.5 text-[11px] font-medium text-slate-500 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60">
                      <AtSign className="w-3 h-3" />
                      <span>Mention an SZMC alumnus</span>
                    </div>
                    {mentionSuggestions.map((cand) => (
                      <button
                        key={cand.id}
                        type="button"
                        onClick={() => handleInsertMention(cand)}
                        className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer"
                      >
                        <img
                          src={cand.avatarUrl || '/assets/aistudio/images__1__2778177d.png'}
                          alt={cand.fullName}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {cand.fullName}
                        </span>
                        {cand.batchYear && (
                          <span className="text-[11px] font-mono text-slate-500 shrink-0">
                            · SZMC-{String(cand.batchYear).padStart(2, '0')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phase 5: Inline Poll Builder */}
              {showPollBuilder && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Community Poll</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPollBuilder(false);
                        setPollQuestion('');
                        setPollOptions(['', '']);
                      }}
                      className="text-xs text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question (e.g., Preferred venue for SZMC Reunion?)"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="space-y-1.5">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) =>
                            setPollOptions((prev) =>
                              prev.map((v, i) => (i === idx ? e.target.value : v))
                            )
                          }
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label="Remove poll option"
                            className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ''])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Option</span>
                    </button>
                  )}
                </div>
              )}

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

              {/* Video Upload Picker with Live Preview & Duration Extraction */}
              {showVideoUploadPicker && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <VideoIcon className="w-3.5 h-3.5 text-rose-500" />
                      <span>Upload Video File</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowVideoUploadPicker(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <VideoUploadPicker
                    onVideoSelected={handlePickerVideoSelected}
                    onClearVideo={handlePickerClearVideo}
                    selectedFile={selectedVideoFile}
                    previewUrl={selectedVideoPreviewUrl}
                  />
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
                  <span>
                    Optimizing & uploading media{uploadProgress > 0 ? ` (${uploadProgress}%)` : ''}...
                  </span>
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
        <div className="px-3.5 sm:px-5 pt-2.5 pb-safe sm:py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer active:scale-95"
              title="Add Photos from Computer Storage"
            >
              <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Photo</span>
            </button>

            {/* Video Button - Toggles VideoUploadPicker and opens file selector */}
            <button
              type="button"
              onClick={() => {
                setShowVideoUploadPicker(true);
                videoFileInputRef.current?.click();
              }}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 text-xs font-bold transition-colors cursor-pointer active:scale-95"
              title="Upload Video from Computer Storage"
            >
              <VideoIcon className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Video</span>
            </button>

            {/* Link Button */}
            <button
              type="button"
              onClick={() => setShowVideoInputDrawer(true)}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 text-xs font-bold transition-colors cursor-pointer active:scale-95"
              title="Attach Link"
              aria-label="Attach Link"
            >
              <LinkIcon className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="hidden sm:inline">Link</span>
            </button>

            {/* Poll Button */}
            <button
              type="button"
              onClick={() => setShowPollBuilder((prev) => !prev)}
              className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer active:scale-95 ${
                showPollBuilder
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300'
              }`}
              title="Attach a Community Poll"
              aria-label="Attach a Community Poll"
            >
              <BarChart3 className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="hidden sm:inline">Poll</span>
            </button>
          </div>

          <button
            onClick={handlePublish}
            disabled={
              isSubmitting ||
              isProcessingMedia ||
              (!content.trim() && totalMediaCount === 0 && !detectedUrl && !hasValidPoll)
            }
            className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 whitespace-nowrap shrink-0"
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
