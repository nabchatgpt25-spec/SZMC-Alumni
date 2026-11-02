import React, { useRef, useState } from 'react';
import { Video, X, AlertCircle, Film } from 'lucide-react';
import { validateVideoFile, extractVideoPoster, VideoMetadata } from '../../services/videoUploadService';

export interface VideoUploadPickerProps {
  onVideoSelected: (file: File, metadata: VideoMetadata) => void;
  onClearVideo: () => void;
  selectedFile: File | null;
  previewUrl: string | null;
}

export const VideoUploadPicker: React.FC<VideoUploadPickerProps> = ({
  onVideoSelected,
  onClearVideo,
  selectedFile,
  previewUrl,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    const validation = validateVideoFile(file);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Invalid video file.');
      return;
    }

    try {
      const meta = await extractVideoPoster(file);
      setDuration(meta.duration);
      onVideoSelected(file, meta);
    } catch {
      onVideoSelected(file, { duration: 0, width: 0, height: 0 });
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/ogg"
        onChange={handleFileChange}
        className="hidden"
      />

      {errorMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!selectedFile ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-2xl bg-slate-50 dark:bg-slate-900/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-110 transition-transform">
            <Film className="w-6 h-6" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Click to upload video
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            MP4, WebM, MOV up to 100 MB
          </span>
        </button>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
          {previewUrl && (
            <video
              src={previewUrl}
              controls
              playsInline
              className="w-full max-h-[300px] object-contain bg-black"
            />
          )}

          <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate max-w-[180px]">{selectedFile.name}</span>
            {duration ? <span>({Math.round(duration)}s)</span> : null}
          </div>

          <button
            type="button"
            onClick={() => {
              onClearVideo();
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
            title="Remove Video"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
