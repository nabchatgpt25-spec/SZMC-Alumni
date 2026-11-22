import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Mic,
  PhoneOff,
  Send,
  ShieldCheck,
  Users,
  Video,
  X,
} from 'lucide-react';

interface HuddleModalProps {
  isOpen: boolean;
  mode: 'audio' | 'video';
  conversationId: string;
  peerName: string;
  myDisplayName: string;
  onClose: () => void;
  onPostInvite?: (inviteText: string) => Promise<void>;
}

export function extractHuddleRoomFromText(text: string): { roomUrl: string; mode: 'audio' | 'video' } | null {
  const match = text.match(/https:\/\/meet\.jit\.si\/(szmc-alumni-huddle-[A-Za-z0-9_-]+)/);
  if (!match) return null;
  const isAudio = /audio huddle/i.test(text);
  return {
    roomUrl: match[0],
    mode: isAudio ? 'audio' : 'video',
  };
}

export const HuddleModal: React.FC<HuddleModalProps> = ({
  isOpen,
  mode,
  conversationId,
  peerName,
  myDisplayName,
  onClose,
  onPostInvite,
}) => {
  const [copied, setCopied] = useState(false);
  const [postingInvite, setPostingInvite] = useState(false);
  const [invitePosted, setInvitePosted] = useState(false);

  const roomName = useMemo(() => {
    const sanitized = (conversationId || 'general').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 42);
    return `szmc-alumni-huddle-${sanitized || 'general'}`;
  }, [conversationId]);

  const roomUrl = `https://meet.jit.si/${roomName}`;

  const iframeSrc = useMemo(() => {
    const params = [
      `config.prejoinPageEnabled=false`,
      `config.startWithVideoMuted=${mode === 'audio' ? 'true' : 'false'}`,
      `config.startWithAudioMuted=false`,
      `config.disableDeepLinking=true`,
      `interfaceConfig.SHOW_JITSI_WATERMARK=false`,
      `interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false`,
      `userInfo.displayName=${encodeURIComponent(myDisplayName || 'SZMC Doctor')}`,
    ].join('&');
    return `${roomUrl}#${params}`;
  }, [roomUrl, mode, myDisplayName]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setInvitePosted(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard permission blocked */
    }
  };

  const handlePostInvite = async () => {
    if (!onPostInvite || postingInvite || invitePosted) return;
    setPostingInvite(true);
    try {
      const label = mode === 'audio' ? 'Audio Huddle' : 'Video Huddle';
      await onPostInvite(`📞 Started a ${label} — Join room: ${roomUrl}`);
      setInvitePosted(true);
    } finally {
      setPostingInvite(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="huddle-modal-title"
    >
      <div className="w-full max-w-4xl h-[84vh] max-h-[720px] rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Top Huddle Control Bar */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#0084FF] text-white flex items-center justify-center shrink-0">
              {mode === 'audio' ? <Mic className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 id="huddle-modal-title" className="text-sm font-bold text-white truncate">
                  {mode === 'audio' ? 'Voice Huddle' : 'Video Huddle'} · {peerName}
                </h2>
                <ShieldCheck className="w-3.5 h-3.5 text-[#0084FF] shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Encrypted peer room for SZMC Alumni
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onPostInvite && (
              <button
                type="button"
                onClick={() => void handlePostInvite()}
                disabled={postingInvite || invitePosted}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-60 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                {invitePosted ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                <span>{invitePosted ? 'Invite sent' : postingInvite ? 'Sending...' : 'Send invite in chat'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Link copied' : 'Copy link'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close huddle"
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Embedded Conference Frame */}
        <div className="flex-1 bg-slate-950 relative">
          <iframe
            src={iframeSrc}
            title={`SZMC Alumni ${mode === 'audio' ? 'Voice' : 'Video'} Huddle`}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="w-full h-full border-0"
          />
        </div>

        {/* Quiet Room Link Strip */}
        <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-3.5 h-3.5 text-[#0084FF] shrink-0" />
            <span className="truncate font-mono">{roomUrl}</span>
          </div>
          <span className="shrink-0 text-slate-500 hidden sm:inline">
            Share or send invite in chat so your colleague can join
          </span>
        </div>
      </div>
    </div>
  );
};
