import type { AlumniProfile } from '../types';

export type FrostedCardTheme = 'acrylic' | 'sapphire' | 'emerald';

export interface FrostedCardMetrics {
  postsCount: number;
  followersCount: number;
  followingCount: number;
}

const THEME_PALETTES: Record<
  FrostedCardTheme,
  {
    bgStart: string;
    bgEnd: string;
    orb1: string;
    orb2: string;
    orb3: string;
    ringStart: string;
    ringMid: string;
    ringEnd: string;
    primaryBtn: string;
  }
> = {
  acrylic: {
    bgStart: '#070910',
    bgEnd: '#120d1d',
    orb1: 'rgba(244, 143, 177, 0.36)',
    orb2: 'rgba(139, 92, 246, 0.34)',
    orb3: 'rgba(251, 146, 60, 0.25)',
    ringStart: '#FDBA74',
    ringMid: '#F472B6',
    ringEnd: '#8B5CF6',
    primaryBtn: 'rgba(139, 145, 232, 0.85)',
  },
  sapphire: {
    bgStart: '#050b16',
    bgEnd: '#0b1830',
    orb1: 'rgba(56, 189, 248, 0.35)',
    orb2: 'rgba(0, 132, 255, 0.36)',
    orb3: 'rgba(99, 102, 241, 0.28)',
    ringStart: '#67E8F9',
    ringMid: '#38BDF8',
    ringEnd: '#0084FF',
    primaryBtn: 'rgba(0, 132, 255, 0.86)',
  },
  emerald: {
    bgStart: '#040e0d',
    bgEnd: '#091f1d',
    orb1: 'rgba(52, 211, 153, 0.32)',
    orb2: 'rgba(20, 184, 166, 0.34)',
    orb3: 'rgba(56, 189, 248, 0.24)',
    ringStart: '#A7F3D0',
    ringMid: '#34D399',
    ringEnd: '#0EA5E9',
    primaryBtn: 'rgba(16, 185, 129, 0.85)',
  },
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const paragraphs = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current);
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth - 20) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 4))}...`;
    }
  }
  return lines;
}

async function loadCorsSafeImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const loadEl = (src: string, crossOrigin: boolean): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });

  try {
    return await loadEl(url, true);
  } catch {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      try {
        return await loadEl(objUrl, false);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch {
      return null;
    }
  }
}

export async function renderFrostedProfileCardPng(params: {
  profile: AlumniProfile;
  metrics: FrostedCardMetrics;
  shareUrl: string;
  theme: FrostedCardTheme;
}): Promise<Blob> {
  const { profile, metrics, shareUrl, theme } = params;
  const palette = THEME_PALETTES[theme];

  const width = 1200;
  const height = 760;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // 1. Studio ambient backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, palette.bgStart);
  bgGrad.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const drawOrb = (cx: number, cy: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  drawOrb(310, 250, 340, palette.orb1);
  drawOrb(860, 290, 360, palette.orb2);
  drawOrb(620, 560, 320, palette.orb3);

  // 2. Frosted acrylic card geometry
  const cardX = 110;
  const cardY = 95;
  const cardW = 980;
  const cardH = 570;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 20;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 38);
  const glassGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  glassGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.08)');
  glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
  ctx.fillStyle = glassGrad;
  ctx.fill();
  ctx.restore();

  // Specular rim border
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 38);
  const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
  borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
  borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.42)');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 3. Avatar with luminous gradient ring
  const avCx = cardX + 128;
  const avCy = cardY + 124;
  const avR = 72;

  ctx.save();
  ctx.shadowColor = palette.ringMid;
  ctx.shadowBlur = 24;
  const ringGrad = ctx.createLinearGradient(avCx - avR, avCy + avR, avCx + avR, avCy - avR);
  ringGrad.addColorStop(0, palette.ringStart);
  ringGrad.addColorStop(0.5, palette.ringMid);
  ringGrad.addColorStop(1, palette.ringEnd);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const avatarImg = await loadCorsSafeImage(profile.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    const scale = Math.max((avR * 2) / avatarImg.width, (avR * 2) / avatarImg.height);
    const dw = avatarImg.width * scale;
    const dh = avatarImg.height * scale;
    ctx.drawImage(avatarImg, avCx - dw / 2, avCy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 42px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = profile.fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase();
    ctx.fillText(initials || 'SZ', avCx, avCy);
  }
  ctx.restore();

  // 4. Headline & 3 Tabular Metrics
  const headerX = cardX + 245;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 24px Plus Jakarta Sans, system-ui, sans-serif';
  const batchTag = profile.batchYear ? `SZMC BATCH ${profile.batchYear}` : 'SZMC ALUMNI';
  const headline = `${profile.fullName.toUpperCase()}  |  ${batchTag}`;
  ctx.fillText(headline.slice(0, 44), headerX, cardY + 86);

  const statItems = [
    { val: metrics.postsCount.toLocaleString(), label: 'posts' },
    { val: metrics.followersCount.toLocaleString(), label: 'followers' },
    { val: metrics.followingCount.toLocaleString(), label: 'following' },
  ];
  statItems.forEach((item, idx) => {
    const sx = headerX + idx * 195;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 30px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(item.val, sx, cardY + 144);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = '500 18px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(item.label, sx, cardY + 172);
  });

  // 5. Role, Bio & Contact Lines
  const contentX = cardX + 56;
  const maxTextW = cardW - 112;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = '600 19px Plus Jakarta Sans, system-ui, sans-serif';
  const roleLine = [profile.position || profile.profession || 'Medical Doctor', profile.cadre]
    .filter(Boolean)
    .join(' · ');
  ctx.fillText(roleLine, contentX, cardY + 242);

  const bioBlocks = [
    profile.institution ? `${profile.institution}${profile.city ? `, ${profile.city}` : ''}` : '',
    profile.degree?.length ? `Qualifications: ${profile.degree.join(', ')}` : '',
    profile.specialty?.length ? `Focus: ${profile.specialty.join(' · ')}` : '',
    profile.bio || '',
  ]
    .filter(Boolean)
    .join('\n');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.font = '500 20px Plus Jakarta Sans, system-ui, sans-serif';
  const bioLines = wrapLines(ctx, bioBlocks || 'Shaheed Ziaur Rahman Medical College Alumni Network', maxTextW, 4);
  bioLines.forEach((line, idx) => {
    ctx.fillText(line, contentX, cardY + 280 + idx * 32);
  });

  // Direct link & social text
  const linksY = cardY + 422;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 18px Plus Jakarta Sans, system-ui, sans-serif';
  const cleanUrl = shareUrl.replace(/^https?:\/\//, '');
  ctx.fillText(`🔗 ${cleanUrl.slice(0, 68)}`, contentX, linksY);

  const contactBits = [
    profile.whatsapp ? `WhatsApp: ${profile.whatsapp}` : '',
    profile.city ? `${profile.city}${profile.country ? `, ${profile.country}` : ''}` : '',
    profile.bloodGroup ? `Blood ${profile.bloodGroup}` : '',
  ].filter(Boolean);
  if (contactBits.length > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '500 17px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(contactBits.join('   ·   ').slice(0, 74), contentX, linksY + 34);
  }

  // 6. Bottom Frosted Glass Action Buttons (Visual Parity)
  const btnY = cardY + cardH - 86;
  const btnH = 52;
  const gap = 16;
  const squareW = 62;
  const pillW = (cardW - 112 - squareW - gap * 3) / 3;

  const drawGlassButton = (x: number, w: number, fill: string, label: string) => {
    drawRoundedRect(ctx, x, btnY, w, btnH, 14);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 18px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, btnY + btnH / 2);
  };

  drawGlassButton(contentX, pillW, palette.primaryBtn, 'Follow');
  drawGlassButton(contentX + pillW + gap, pillW, 'rgba(255,255,255,0.16)', 'Message');
  drawGlassButton(contentX + (pillW + gap) * 2, pillW, 'rgba(255,255,255,0.16)', 'Contact');
  drawGlassButton(contentX + (pillW + gap) * 3, squareW, 'rgba(255,255,255,0.16)', '+');

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not export card image.'));
        else resolve(blob);
      },
      'image/png',
      1
    );
  });
}
