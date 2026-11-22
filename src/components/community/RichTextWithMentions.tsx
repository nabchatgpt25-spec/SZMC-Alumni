import React from 'react';
import { parseRichTextSegments } from '../../services/richInteractionsUtils';

interface RichTextWithMentionsProps {
  text: string;
  onMentionClick?: (handle: string) => void;
  className?: string;
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Safely renders post or comment text with clickable http/https links and
 * interactive @mentions using pure React nodes (zero raw HTML injection).
 */
export const RichTextWithMentions: React.FC<RichTextWithMentionsProps> = ({
  text,
  onMentionClick,
  className,
}) => {
  const segments = parseRichTextSegments(text);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.kind === 'url') {
          const cleanUrl = seg.raw.replace(/[.,;!?)]+$/, '');
          const trailing = seg.raw.slice(cleanUrl.length);
          if (!isSafeHttpUrl(cleanUrl)) {
            return <React.Fragment key={idx}>{seg.raw}</React.Fragment>;
          }
          return (
            <React.Fragment key={idx}>
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 dark:text-blue-400 hover:underline break-all font-medium"
              >
                {cleanUrl}
              </a>
              {trailing}
            </React.Fragment>
          );
        }

        if (seg.kind === 'mention') {
          const displayLabel = `@${seg.handle}`;
          if (onMentionClick) {
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMentionClick(seg.handle);
                }}
                className="inline font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xs"
              >
                {displayLabel}
              </button>
            );
          }
          return (
            <span
              key={idx}
              className="font-semibold text-blue-700 dark:text-blue-400"
            >
              {displayLabel}
            </span>
          );
        }

        return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
      })}
    </span>
  );
};
