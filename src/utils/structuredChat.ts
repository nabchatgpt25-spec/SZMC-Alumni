export type StructuredCardData =
  | {
      kind: 'consult';
      specialty: string;
      urgency: 'Routine' | 'Urgent';
      summary: string;
      question?: string;
    }
  | {
      kind: 'lifeline';
      bloodGroup: string;
      hospital: string;
      note: string;
    }
  | {
      kind: 'poll';
      question: string;
      options: string[];
    }
  | {
      kind: 'profile_card';
      profileId: number;
      fullName: string;
      batchYear: number;
      specialty: string;
      institution?: string;
      avatarUrl?: string;
      profileUrl: string;
      note?: string;
    };

export const POLL_OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'] as const;

function sanitizeSingleLine(value: string | undefined | null, fallback = ''): string {
  return (value ?? fallback).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildProfileShareCardMessageText(input: {
  profileId: number;
  fullName: string;
  batchYear: number;
  specialty: string;
  institution?: string;
  avatarUrl?: string;
  profileUrl: string;
  note?: string;
}): string {
  const safeName = sanitizeSingleLine(input.fullName, 'SZMC Alumnus');
  const safeBatch = Number.isFinite(input.batchYear) && input.batchYear > 0 ? Math.round(input.batchYear) : 20;
  const safeSpecialty = sanitizeSingleLine(input.specialty, 'Medical Doctor');
  const safeInstitution = sanitizeSingleLine(input.institution);
  const safeNote = sanitizeSingleLine(input.note);
  const safeAvatar = sanitizeSingleLine(input.avatarUrl);
  const safeUrl = sanitizeSingleLine(input.profileUrl);

  const lines = [
    `[SZMC ProfileCard · ${input.profileId} · Batch ${safeBatch}]`,
    `Name: ${safeName}`,
    `Specialty: ${safeSpecialty}`,
  ];
  if (safeInstitution) {
    lines.push(`Institution: ${safeInstitution}`);
  }
  // Never inline large base64 data URIs inside the message text body
  if (safeAvatar && !safeAvatar.startsWith('data:')) {
    lines.push(`Avatar: ${safeAvatar}`);
  }
  if (safeUrl) {
    lines.push(`Link: ${safeUrl}`);
  }
  if (safeNote) {
    lines.push(`Note: ${safeNote}`);
  }
  return lines.join('\n');
}

export function buildConsultMessageText(input: {
  specialty: string;
  urgency: 'Routine' | 'Urgent';
  summary: string;
  question?: string;
}): string {
  const specialty = input.specialty.trim() || 'General Medicine';
  const summary = input.summary.trim();
  const question = (input.question || '').trim();
  const lines = [
    `[SZMC Consult · ${specialty} · ${input.urgency}]`,
    `Case: ${summary}`,
  ];
  if (question) {
    lines.push(`Question: ${question}`);
  }
  return lines.join('\n');
}

export function buildLifelineMessageText(input: {
  bloodGroup: string;
  hospital: string;
  note: string;
}): string {
  const group = input.bloodGroup.trim() || 'Urgent Referral';
  const hospital = input.hospital.trim() || 'Hospital / Location unspecified';
  const note = input.note.trim();
  const lines = [
    `[SZMC Lifeline · ${group} · ${hospital}]`,
    note ? `Details: ${note}` : 'Urgent clinical / donor assistance needed.',
  ];
  return lines.join('\n');
}

export function buildPollMessageText(input: {
  question: string;
  options: string[];
}): string {
  const question = input.question.trim();
  const cleanOptions = input.options
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 4);
  const lines = ['[SZMC Poll]', `Q: ${question}`];
  cleanOptions.forEach((opt, idx) => {
    lines.push(`${idx + 1}) ${opt}`);
  });
  return lines.join('\n');
}

export function parseStructuredChatMessage(text: string | null | undefined): StructuredCardData | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('[SZMC ')) return null;

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0];

  const profileMatch = header.match(/^\[SZMC ProfileCard · (\d+)(?: · Batch (\d+))?\]$/);
  if (profileMatch) {
    const profileId = Number(profileMatch[1]);
    const batchYear = Number(profileMatch[2] || 20) || 20;
    let fullName = '';
    let specialty = '';
    let institution = '';
    let avatarUrl = '';
    let profileUrl = '';
    let note = '';

    for (const line of lines.slice(1)) {
      if (line.startsWith('Name:')) fullName = line.slice(5).trim();
      else if (line.startsWith('Specialty:')) specialty = line.slice(10).trim();
      else if (line.startsWith('Institution:')) institution = line.slice(12).trim();
      else if (line.startsWith('Avatar:')) avatarUrl = line.slice(7).trim();
      else if (line.startsWith('Link:')) profileUrl = line.slice(5).trim();
      else if (line.startsWith('Note:')) note = line.slice(5).trim();
    }

    if (!profileId || !fullName) return null;
    return {
      kind: 'profile_card',
      profileId,
      fullName,
      batchYear,
      specialty: specialty || 'SZMC Physician',
      institution: institution || undefined,
      avatarUrl: avatarUrl || undefined,
      profileUrl: profileUrl || `?card=${profileId}`,
      note: note || undefined,
    };
  }

  const consultMatch = header.match(/^\[SZMC Consult · (.+?) · (Routine|Urgent)\]$/);
  if (consultMatch) {
    let summary = '';
    let question = '';
    for (const line of lines.slice(1)) {
      if (line.startsWith('Case:')) {
        summary = line.slice(5).trim();
      } else if (line.startsWith('Question:')) {
        question = line.slice(9).trim();
      } else {
        summary = summary ? `${summary} ${line}` : line;
      }
    }
    if (!summary) return null;
    return {
      kind: 'consult',
      specialty: consultMatch[1].trim(),
      urgency: consultMatch[2] as 'Routine' | 'Urgent',
      summary,
      question: question || undefined,
    };
  }

  const lifelineMatch = header.match(/^\[SZMC Lifeline · (.+?) · (.+?)\]$/);
  if (lifelineMatch) {
    const bodyLines = lines.slice(1).map((line) =>
      line.startsWith('Details:') ? line.slice(8).trim() : line
    );
    return {
      kind: 'lifeline',
      bloodGroup: lifelineMatch[1].trim(),
      hospital: lifelineMatch[2].trim(),
      note: bodyLines.join(' ').trim(),
    };
  }

  if (header === '[SZMC Poll]') {
    const qLine = lines[1] || '';
    const question = qLine.startsWith('Q:') ? qLine.slice(2).trim() : qLine;
    const options: string[] = [];
    for (const line of lines.slice(2)) {
      const optMatch = line.match(/^[1-4]\)\s*(.+)$/);
      if (optMatch && optMatch[1]) {
        options.push(optMatch[1].trim());
      }
    }
    if (!question || options.length < 2) return null;
    return {
      kind: 'poll',
      question,
      options,
    };
  }

  return null;
}

export function formatStructuredPreview(text: string | null | undefined): string | null {
  const parsed = parseStructuredChatMessage(text);
  if (!parsed) return null;
  if (parsed.kind === 'profile_card') {
    return `🪪 Profile Card: ${parsed.fullName} (Batch ${parsed.batchYear})`;
  }
  if (parsed.kind === 'consult') {
    return `🩺 Consult (${parsed.specialty}): ${parsed.summary}`;
  }
  if (parsed.kind === 'lifeline') {
    return `🩸 Lifeline (${parsed.bloodGroup} · ${parsed.hospital}): ${parsed.note}`;
  }
  return `📊 Poll: ${parsed.question}`;
}

export interface TextLinkSegment {
  type: 'text' | 'link';
  value: string;
}

const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

export function tokenizeLinks(text: string): TextLinkSegment[] {
  if (!text) return [];
  const rawParts = text.split(URL_SPLIT_REGEX);
  const segments: TextLinkSegment[] = [];

  for (const part of rawParts) {
    if (!part) continue;
    if (/^https?:\/\//i.test(part)) {
      const trailingMatch = part.match(/^(.*?)([.,!?;:)]+)$/);
      if (trailingMatch && trailingMatch[1].length > 8) {
        segments.push({ type: 'link', value: trailingMatch[1] });
        segments.push({ type: 'text', value: trailingMatch[2] });
      } else {
        segments.push({ type: 'link', value: part });
      }
    } else {
      segments.push({ type: 'text', value: part });
    }
  }
  return segments;
}
