import type { AlumniProfile } from '../types';
import handHeldGlassBgUrl from '../assets/images/hand_held_glass_card_blank_1795371015384.jpg';

export type FrostedCardTheme = 'acrylic' | 'sapphire' | 'emerald';

export type ProfileCardStyleId = 'handheld' | 'present';

export type ProfileCardExportFormat = 'jpg' | 'png';

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

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const paragraphs = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
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
      return await loadEl(url, false);
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
}

function getInitials(fullName: string): string {
  return (
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase() || 'SZ'
  );
}

function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  avatarImg: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  fullName: string,
  fallbackBg = '#1e293b',
  fallbackText = '#f8fafc'
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    const scale = Math.max((r * 2) / avatarImg.width, (r * 2) / avatarImg.height);
    const dw = avatarImg.width * scale;
    const dh = avatarImg.height * scale;
    ctx.drawImage(avatarImg, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = fallbackBg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = fallbackText;
    ctx.font = `800 ${Math.round(r * 0.6)}px Plus Jakarta Sans, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(fullName), cx, cy);
  }
  ctx.restore();
}

const EXPORT_SCALE = 2;

function createHiResCanvas(
  width: number,
  height: number,
  scale = EXPORT_SCALE
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

function canvasToImageBlob(
  canvas: HTMLCanvasElement,
  format: ProfileCardExportFormat = 'jpg'
): Promise<Blob> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? 1 : 0.96;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not export card image.'));
        else resolve(blob);
      },
      mime,
      quality
    );
  });
}

async function renderHandHeldGlassCardImage(params: {
  profile: AlumniProfile;
  metrics: FrostedCardMetrics;
  format: ProfileCardExportFormat;
}): Promise<Blob> {
  const { profile, metrics, format } = params;
  const width = 896;
  const height = 1200;
  const { canvas, ctx } = createHiResCanvas(width, height);

  // 1. Draw the photorealistic hand-holding-blank-glass-card backdrop
  const bgImg = await loadCorsSafeImage(handHeldGlassBgUrl);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, width, height);
  } else {
    const fallbackGrad = ctx.createLinearGradient(0, 0, width, height);
    fallbackGrad.addColorStop(0, '#07090f');
    fallbackGrad.addColorStop(1, '#141824');
    ctx.fillStyle = fallbackGrad;
    ctx.fillRect(0, 0, width, height);
  }

  const avatarImg = await loadCorsSafeImage(profile.avatarUrl);

  // 2. Transform into the exact tilted acrylic card plane (measured from blank card photo)
  const cardCenterX = 459;
  const cardCenterY = 561;
  const cardW = 682;
  const cardH = 570;
  const cardX = -cardW / 2;
  const cardY = -cardH / 2;
  const tiltRad = (-5.6 * Math.PI) / 180;

  ctx.save();
  ctx.translate(cardCenterX, cardCenterY);
  ctx.rotate(tiltRad);

  // Clip strictly inside the beveled acrylic glass card
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.clip();

  // Subtle internal frosted specular tint so white typography stays ultra-crisp over the finger
  const glassTint = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  glassTint.addColorStop(0, 'rgba(15, 18, 28, 0.24)');
  glassTint.addColorStop(0.55, 'rgba(15, 18, 28, 0.16)');
  glassTint.addColorStop(1, 'rgba(15, 18, 28, 0.28)');
  ctx.fillStyle = glassTint;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Top-right crisp luminous X
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 12;
  const xCx = cardX + cardW - 36;
  const xCy = cardY + 34;
  ctx.beginPath();
  ctx.moveTo(xCx - 11, xCy - 11);
  ctx.lineTo(xCx + 11, xCy + 11);
  ctx.moveTo(xCx + 11, xCy - 11);
  ctx.lineTo(xCx - 11, xCy + 11);
  ctx.stroke();
  ctx.restore();

  // Top-left circular avatar with luminous peach-to-lavender halo ring
  const avCx = cardX + 104;
  const avCy = cardY + 108;
  const avR = 66;

  ctx.save();
  ctx.shadowColor = 'rgba(232, 168, 255, 0.75)';
  ctx.shadowBlur = 24;
  const haloGrad = ctx.createLinearGradient(avCx - avR, avCy - avR, avCx + avR, avCy + avR);
  haloGrad.addColorStop(0, '#FDE2C4');
  haloGrad.addColorStop(0.5, '#F5B7D6');
  haloGrad.addColorStop(1, '#C4B5FD');
  ctx.strokeStyle = haloGrad;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  drawAvatarCircle(ctx, avatarImg, avCx, avCy, avR, profile.fullName);

  // Header headline + 3-column metrics beside avatar
  const headerX = cardX + 196;
  const headerMaxW = cardW - 248;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const batchTag = profile.batchYear
    ? `SZMC BATCH ${profile.batchYear < 10 ? `0${profile.batchYear}` : profile.batchYear}`
    : 'SZMC ALUMNI';
  const headline = `${profile.fullName.toUpperCase()} | ${batchTag}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 19px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, headline, headerMaxW), headerX, cardY + 84);

  const statItems = [
    { val: metrics.postsCount.toLocaleString(), label: 'posts' },
    { val: metrics.followersCount.toLocaleString(), label: 'followers' },
    { val: metrics.followingCount.toLocaleString(), label: 'following' },
  ];
  statItems.forEach((item, idx) => {
    const sx = headerX + idx * 148;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 28px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(item.val, sx, cardY + 132);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = '400 18px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(item.label, sx, cardY + 158);
  });

  // Middle bio section (exact vertical rhythm of the reference card)
  const contentX = cardX + 36;
  const contentMaxW = cardW - 72;

  const roleLine = [profile.position || profile.profession || 'SZMC Physician', profile.cadre]
    .filter(Boolean)
    .join(' · ');
  ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
  ctx.font = '500 19px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, roleLine, contentMaxW), contentX, cardY + 216);

  const line1 = `🌐 ${
    profile.institution
      ? `${profile.institution}${profile.city ? `, ${profile.city}` : ''}`
      : 'Shaheed Ziaur Rahman Medical College, Bogura'
  }`;
  const degSpec = [
    profile.degree?.slice(0, 2).join(' • '),
    profile.specialty?.slice(0, 2).join(' • '),
  ]
    .filter(Boolean)
    .join(' • ');
  const line2 = `🩺 ${degSpec || 'MBBS • Clinical Practice • SZMC Alumni'}`;
  const bioClean = profile.bio ? profile.bio.replace(/\s+/g, ' ').trim() : '';
  const line3 = `💡 ${
    bioClean ||
    (profile.bloodGroup
      ? `Blood Group ${profile.bloodGroup} • Serving patients & alumni community`
      : 'Connecting SZMC physicians across 35 MBBS batches')
  }`;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.font = '400 19px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText(truncateText(ctx, line1, contentMaxW), contentX, cardY + 248);
  ctx.fillText(truncateText(ctx, line2, contentMaxW), contentX, cardY + 278);
  ctx.fillText(truncateText(ctx, line3, contentMaxW), contentX, cardY + 308);

  // Secondary bold action text (matches "Lihat terjemahan")
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 19px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText(
    profile.verificationStatus === 'verified'
      ? 'Verified SZMC Alumni Profile'
      : 'View full alumni profile',
    contentX,
    cardY + 344
  );

  // WhatsApp & Facebook row with crisp vector icons
  const socialY = cardY + 392;
  const waIconCx = contentX + 10;
  const waIconCy = socialY - 6;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(waIconCx, waIconCy, 9.5, 0.55, Math.PI * 2 + 0.12);
  ctx.lineTo(waIconCx - 9, waIconCy + 9.5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(waIconCx, waIconCy, 4.2, 0.35, 1.9);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.font = '400 18.5px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText('WhatsApp', contentX + 27, socialY);

  const waBlockW = 27 + ctx.measureText('WhatsApp').width + 26;
  const fbIconCx = contentX + waBlockW + 10;
  const fbIconCy = socialY - 6;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fbIconCx, fbIconCy, 9.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 14px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('f', fbIconCx + 0.5, fbIconCy + 1);
  ctx.restore();

  const fbName = `${profile.fullName.split(' ').slice(0, 2).join(' ')}${
    profile.city ? ` · ${profile.city}` : ''
  }`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.font = '400 18.5px Plus Jakarta Sans, system-ui, sans-serif';
  ctx.fillText(
    truncateText(ctx, fbName, Math.max(120, contentMaxW - waBlockW - 28)),
    contentX + waBlockW + 27,
    socialY
  );
  ctx.restore();

  // Bottom 4-button frosted glass strip (exact periwinkle-indigo Follow + 3 neutral glass)
  const btnY = cardY + cardH - 86;
  const btnH = 54;
  const gap = 12;
  const squareW = 58;
  const pillW = (contentMaxW - squareW - gap * 3) / 3;

  const drawRefButton = (
    x: number,
    w: number,
    fill: string,
    stroke: string,
    label: string,
    isUserPlusIcon = false
  ) => {
    ctx.save();
    drawRoundedRect(ctx, x, btnY, w, btnH, 14);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (isUserPlusIcon) {
      const cx = x + w / 2 + 2;
      const cy = btnY + btnH / 2;
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      // Person head
      ctx.beginPath();
      ctx.arc(cx + 2, cy - 6, 5.2, 0, Math.PI * 2);
      ctx.fill();
      // Person shoulders
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 10, 9.5, Math.PI * 1.12, Math.PI * 1.88);
      ctx.fill();
      // Plus sign on the left
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 1);
      ctx.lineTo(cx - 6, cy - 1);
      ctx.moveTo(cx - 9, cy - 4);
      ctx.lineTo(cx - 9, cy + 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 19px Plus Jakarta Sans, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, btnY + btnH / 2 + 1);
    }
    ctx.restore();
  };

  drawRefButton(
    contentX,
    pillW,
    'rgba(137, 142, 224, 0.80)',
    'rgba(255, 255, 255, 0.38)',
    'Follow'
  );
  drawRefButton(
    contentX + pillW + gap,
    pillW,
    'rgba(255, 255, 255, 0.17)',
    'rgba(255, 255, 255, 0.32)',
    'Message'
  );
  drawRefButton(
    contentX + (pillW + gap) * 2,
    pillW,
    'rgba(255, 255, 255, 0.17)',
    'rgba(255, 255, 255, 0.32)',
    'Contact'
  );
  drawRefButton(
    contentX + (pillW + gap) * 3,
    squareW,
    'rgba(255, 255, 255, 0.17)',
    'rgba(255, 255, 255, 0.32)',
    '',
    true
  );

  // Subtle internal glass edge sheen
  ctx.save();
  drawRoundedRect(ctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 29);
  const rimGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  rimGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
  rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0.18)');
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  return canvasToImageBlob(canvas, format);
}

export async function renderFrostedProfileCardImage(params: {
  profile: AlumniProfile;
  metrics: FrostedCardMetrics;
  shareUrl?: string;
  theme: FrostedCardTheme;
  styleId?: ProfileCardStyleId;
  format?: ProfileCardExportFormat;
}): Promise<Blob> {
  const {
    profile,
    metrics,
    theme,
    styleId = 'present',
    format = 'jpg',
  } = params;

  if (styleId === 'handheld') {
    return renderHandHeldGlassCardImage({ profile, metrics, format });
  }

  // Present Studio Frosted Card (2x Ultra-HD)
  const palette = THEME_PALETTES[theme];

  const width = 1200;
  const height = 760;
  const { canvas, ctx } = createHiResCanvas(width, height);

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
  drawAvatarCircle(ctx, avatarImg, avCx, avCy, avR, profile.fullName);

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
  const bioLines = wrapLines(
    ctx,
    bioBlocks || 'Shaheed Ziaur Rahman Medical College Alumni Network',
    maxTextW,
    4
  );
  bioLines.forEach((line, idx) => {
    ctx.fillText(line, contentX, cardY + 280 + idx * 32);
  });

  // Social & metadata text
  const linksY = cardY + 428;
  const contactBits = [
    profile.whatsapp ? `WhatsApp: ${profile.whatsapp}` : '',
    profile.city ? `${profile.city}${profile.country ? `, ${profile.country}` : ''}` : '',
    profile.bloodGroup ? `Blood ${profile.bloodGroup}` : '',
  ].filter(Boolean);
  if (contactBits.length > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
    ctx.font = '500 18px Plus Jakarta Sans, system-ui, sans-serif';
    ctx.fillText(contactBits.join('   ·   ').slice(0, 74), contentX, linksY);
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

  return canvasToImageBlob(canvas, format);
}

export async function renderFrostedProfileCardPng(params: {
  profile: AlumniProfile;
  metrics: FrostedCardMetrics;
  shareUrl: string;
  theme: FrostedCardTheme;
  styleId?: ProfileCardStyleId;
}): Promise<Blob> {
  return renderFrostedProfileCardImage({ ...params, format: 'png' });
}
