import type { PostComment, ReactionType, PostPoll } from '../types/post';

export interface ReactionMeta {
  type: ReactionType;
  label: string;
  emoji: string;
  activeClass: string;
}

export const REACTIONS: ReactionMeta[] = [
  {
    type: 'like',
    label: 'Like',
    emoji: '👍',
    activeClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-blue-200 dark:ring-blue-900/60',
  },
  {
    type: 'love',
    label: 'Love',
    emoji: '❤️',
    activeClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 ring-rose-200 dark:ring-rose-900/60',
  },
  {
    type: 'care',
    label: 'Support',
    emoji: '🤝',
    activeClass: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-amber-200 dark:ring-amber-900/60',
  },
  {
    type: 'haha',
    label: 'Haha',
    emoji: '😄',
    activeClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-amber-200 dark:ring-amber-900/60',
  },
  {
    type: 'wow',
    label: 'Insightful',
    emoji: '💡',
    activeClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 ring-indigo-200 dark:ring-indigo-900/60',
  },
  {
    type: 'sad',
    label: 'Sympathy',
    emoji: '🙏',
    activeClass: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 ring-slate-300 dark:ring-slate-700',
  },
  {
    type: 'angry',
    label: 'Concern',
    emoji: '⚠️',
    activeClass: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 ring-orange-200 dark:ring-orange-900/60',
  },
];

export function getReactionMeta(type?: ReactionType | null): ReactionMeta {
  return REACTIONS.find((r) => r.type === type) || REACTIONS[0];
}

export function getTopReactions(
  summary?: Partial<Record<ReactionType, number>>,
  fallbackReaction?: ReactionType | null,
  fallbackTotal = 0
): { type: ReactionType; emoji: string; count: number }[] {
  if (summary && Object.keys(summary).length > 0) {
    return Object.entries(summary)
      .filter(([, count]) => typeof count === 'number' && count > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([type, count]) => ({
        type: type as ReactionType,
        emoji: getReactionMeta(type as ReactionType).emoji,
        count: Number(count),
      }));
  }
  if (fallbackTotal > 0) {
    const meta = getReactionMeta(fallbackReaction || 'love');
    return [{ type: meta.type, emoji: meta.emoji, count: fallbackTotal }];
  }
  return [];
}

/**
 * Converts a flat array of comments (potentially with `parentCommentId` or already nested `replies`)
 * into a clean deduplicated nested tree suitable for rendering.
 */
export function buildCommentTree(rawComments: PostComment[]): PostComment[] {
  if (!Array.isArray(rawComments) || rawComments.length === 0) return [];

  const byId = new Map<number, PostComment>();
  const flat: PostComment[] = [];

  const collect = (list: PostComment[], inferredParentId?: number | null) => {
    for (const c of list) {
      if (!c || !c.id) continue;
      const parentId = c.parentCommentId ?? inferredParentId ?? null;
      if (!byId.has(c.id)) {
        const clone: PostComment = {
          ...c,
          parentCommentId: parentId,
          replies: [],
        };
        byId.set(c.id, clone);
        flat.push(clone);
      }
      if (Array.isArray(c.replies) && c.replies.length > 0) {
        collect(c.replies, c.id);
      }
    }
  };

  collect(rawComments, null);

  const roots: PostComment[] = [];
  for (const node of flat) {
    const pId = node.parentCommentId;
    if (pId && pId !== node.id && byId.has(pId)) {
      const parent = byId.get(pId)!;
      parent.replies = parent.replies || [];
      if (!parent.replies.some((r) => r.id === node.id)) {
        parent.replies.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export interface MentionCandidate {
  id: number;
  fullName: string;
  batchYear?: number;
  avatarUrl?: string;
}

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; raw: string; handle: string }
  | { kind: 'url'; raw: string };

// Matches @[Full Name] or @Dr.Name / @word.word (excluding emails like foo@bar.com)
const TOKEN_REGEX =
  /(https?:\/\/[^\s<>"']+|(?<![a-zA-Z0-9._%+-])@\[([^\]]{2,60})\]|(?<![a-zA-Z0-9._%+-])@([A-Za-z][A-Za-z0-9._-]{1,35}))/g;

/**
 * Pure, XSS-safe tokenizer that splits text into plain strings, URLs, and @mentions.
 * Always render these as React elements—never via innerHTML / dangerouslySetInnerHTML.
 */
export function parseRichTextSegments(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let lastIdx = 0;

  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIdx) {
      segments.push({ kind: 'text', value: text.slice(lastIdx, start) });
    }
    const full = match[0];
    if (full.startsWith('http://') || full.startsWith('https://')) {
      segments.push({ kind: 'url', raw: full });
    } else {
      const bracketed = match[2];
      const simple = match[3];
      const handle = (bracketed || simple || '').trim();
      segments.push({ kind: 'mention', raw: full, handle });
    }
    lastIdx = start + full.length;
  }

  if (lastIdx < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIdx) });
  }
  return segments;
}

export function extractMentionedUserIds(
  text: string,
  candidates: MentionCandidate[]
): number[] {
  if (!text || !Array.isArray(candidates) || candidates.length === 0) return [];
  const segments = parseRichTextSegments(text);
  const found = new Set<number>();

  for (const seg of segments) {
    if (seg.kind !== 'mention') continue;
    const target = seg.handle.toLowerCase().replace(/^dr\.?\s*/i, '').trim();
    if (!target) continue;

    const matched = candidates.find((c) => {
      const full = c.fullName.toLowerCase().trim();
      const stripped = full.replace(/^dr\.?\s*/i, '').trim();
      const compact = stripped.replace(/\s+/g, '.');
      return (
        full === target ||
        stripped === target ||
        compact === target ||
        stripped.startsWith(target)
      );
    });
    if (matched) found.add(matched.id);
  }
  return Array.from(found);
}

export function normalizePollOptions(rawOptions: string[]): string[] {
  return rawOptions
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .slice(0, 6);
}

export function computePollOptionPercent(poll: PostPoll, optionIndex: number): number {
  if (!poll.totalVotes || poll.totalVotes <= 0) return 0;
  const count = poll.voteCounts[optionIndex] || 0;
  return Math.round((count / poll.totalVotes) * 100);
}
