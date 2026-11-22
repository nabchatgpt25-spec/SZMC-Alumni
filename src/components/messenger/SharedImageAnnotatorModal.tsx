import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import {
  ArrowUpRight,
  Check,
  Circle,
  Eraser,
  Highlighter,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Type,
  Undo2,
  Users,
  X,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import {
  broadcastDmAnnotationSession,
  connectAnnotationRoom,
  uploadChatImage,
  type AnnotationRoomConnection,
} from '../../services/messagingService';
import type {
  AnnotationCollaborator,
  AnnotationCursor,
  AnnotationObject,
  AnnotationStrokePreview,
  AnnotationStrokeWidth,
  AnnotationTarget,
  AnnotationTool,
  FreehandAnnotationObject,
  ShapeAnnotationObject,
  TextAnnotationObject,
} from '../../types/annotation';
import { playSound } from '../../utils/audio';

interface SharedImageAnnotatorModalProps {
  isOpen: boolean;
  conversationId: string;
  myId: number;
  myDisplayName: string;
  myAvatarUrl: string;
  peerName: string;
  target: AnnotationTarget | null;
  onClose: () => void;
  onSaveToThread: (payload: {
    mediaUrl: string;
    caption: string;
    replyToMessageId?: string | null;
  }) => Promise<boolean>;
}

const COLOR_SWATCHES = [
  { hex: '#EF4444', label: 'Crimson (Urgent / Acute)' },
  { hex: '#F59E0B', label: 'Amber (Caution / Border)' },
  { hex: '#10B981', label: 'Emerald (Normal / Reference)' },
  { hex: '#06B6D4', label: 'Cyan (Interval / Measurement)' },
  { hex: '#0084FF', label: 'Blue (Note)' },
  { hex: '#FFFFFF', label: 'White (Dark Film)' },
];

const WIDTH_FACTORS: Record<AnnotationStrokeWidth, number> = {
  fine: 2.5,
  medium: 5,
  bold: 9.5,
};

function isSafeImageSource(url: string): boolean {
  const clean = (url || '').trim();
  if (!clean) return false;
  if (clean.startsWith('data:image/')) return true;
  if (clean.startsWith('blob:')) return true;
  if (clean.startsWith('/')) return true;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function sortObjectsChronologically(list: AnnotationObject[]): AnnotationObject[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt);
}

export const SharedImageAnnotatorModal: React.FC<SharedImageAnnotatorModalProps> = ({
  isOpen,
  conversationId,
  myId,
  myDisplayName,
  myAvatarUrl,
  peerName,
  target,
  onClose,
  onSaveToThread,
}) => {
  const [activeTool, setActiveTool] = useState<AnnotationTool>('pen');
  const [activeColor, setActiveColor] = useState<string>('#EF4444');
  const [strokePreset, setStrokePreset] = useState<AnnotationStrokeWidth>('medium');
  const [caption, setCaption] = useState('🩺 Annotated clinical image');

  const [objects, setObjects] = useState<AnnotationObject[]>([]);
  const [collaborators, setCollaborators] = useState<AnnotationCollaborator[]>([]);
  const [roomStatus, setRoomStatus] = useState<'CONNECTING' | 'SUBSCRIBED' | 'CLOSED'>('CONNECTING');
  const [peerSavedBanner, setPeerSavedBanner] = useState<string | null>(null);

  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 640, h: 420 });

  const [pendingTextCallout, setPendingTextCallout] = useState<{
    nx: number;
    ny: number;
    leftPx: number;
    topPx: number;
  } | null>(null);
  const [calloutInput, setCalloutInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Refs for Konva canvas & authoritative state (prevents React re-renders & sync loops)
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const bgLayerRef = useRef<Konva.Layer | null>(null);
  const objectsLayerRef = useRef<Konva.Layer | null>(null);
  const liveLayerRef = useRef<Konva.Layer | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const roomRef = useRef<AnnotationRoomConnection | null>(null);

  const objectsMapRef = useRef<Map<string, AnnotationObject>>(new Map());
  const remotePreviewsRef = useRef<Map<string, AnnotationStrokePreview & { updatedAt: number }>>(new Map());
  const remoteCursorsRef = useRef<Map<number, AnnotationCursor>>(new Map());
  const localDraftRef = useRef<AnnotationStrokePreview | null>(null);
  const isDrawingRef = useRef(false);
  const lastPreviewEmitRef = useRef(0);
  const lastCursorEmitRef = useRef(0);
  const objectUrlCleanupRef = useRef<string | null>(null);

  // Keep latest tool settings accessible in Konva event callbacks
  const toolStateRef = useRef({
    activeTool,
    activeColor,
    strokePreset,
    myId,
    myDisplayName,
    stageSize,
  });
  toolStateRef.current = {
    activeTool,
    activeColor,
    strokePreset,
    myId,
    myDisplayName,
    stageSize,
  };

  const myCollaboratorColor = useMemo(() => {
    const palette = ['#0084FF', '#10B981', '#F59E0B', '#EF4444'];
    return palette[Math.abs(myId) % palette.length];
  }, [myId]);

  const syncObjectsStateFromMap = useCallback(() => {
    const sorted = sortObjectsChronologically(Array.from(objectsMapRef.current.values()));
    setObjects(sorted);
  }, []);

  // Render committed annotations onto objectsLayer
  const redrawObjectsLayer = useCallback(() => {
    const layer = objectsLayerRef.current;
    const stage = stageRef.current;
    if (!layer || !stage) return;

    const w = stage.width();
    const h = stage.height();
    const scaleFactor = Math.max(0.55, w / 1000);

    layer.destroyChildren();
    const sorted = sortObjectsChronologically(Array.from(objectsMapRef.current.values()));

    sorted.forEach((obj) => {
      if (obj.tool === 'pen' || obj.tool === 'highlighter') {
        const pxPoints: number[] = [];
        for (let i = 0; i < obj.points.length; i += 2) {
          pxPoints.push(obj.points[i] * w, obj.points[i + 1] * h);
        }
        const line = new Konva.Line({
          points: pxPoints,
          stroke: obj.color,
          strokeWidth: Math.max(2, obj.strokeWidth * scaleFactor),
          opacity: obj.opacity,
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0.35,
          hitStrokeWidth: Math.max(18, obj.strokeWidth * scaleFactor + 12),
        });
        line.setAttr('annotationId', obj.id);
        layer.add(line);
      } else if (obj.tool === 'arrow') {
        const sw = Math.max(2, obj.strokeWidth * scaleFactor);
        const arrow = new Konva.Arrow({
          points: [obj.x1 * w, obj.y1 * h, obj.x2 * w, obj.y2 * h],
          stroke: obj.color,
          fill: obj.color,
          strokeWidth: sw,
          pointerLength: Math.max(10, sw * 2.6),
          pointerWidth: Math.max(9, sw * 2.3),
          opacity: obj.opacity,
          lineCap: 'round',
          hitStrokeWidth: Math.max(18, sw + 12),
        });
        arrow.setAttr('annotationId', obj.id);
        layer.add(arrow);
      } else if (obj.tool === 'circle') {
        const cx = ((obj.x1 + obj.x2) / 2) * w;
        const cy = ((obj.y1 + obj.y2) / 2) * h;
        const rx = Math.max(4, Math.abs(obj.x2 - obj.x1) * w * 0.5);
        const ry = Math.max(4, Math.abs(obj.y2 - obj.y1) * h * 0.5);
        const sw = Math.max(2, obj.strokeWidth * scaleFactor);
        const ellipse = new Konva.Ellipse({
          x: cx,
          y: cy,
          radiusX: rx,
          radiusY: ry,
          stroke: obj.color,
          strokeWidth: sw,
          opacity: obj.opacity,
          hitStrokeWidth: Math.max(18, sw + 12),
        });
        ellipse.setAttr('annotationId', obj.id);
        layer.add(ellipse);
      } else if (obj.tool === 'text') {
        const fontPx = Math.max(12, Math.round(obj.fontSize * scaleFactor));
        const label = new Konva.Label({
          x: obj.x * w,
          y: obj.y * h,
        });
        label.setAttr('annotationId', obj.id);
        const tag = new Konva.Tag({
          fill: 'rgba(15, 23, 42, 0.85)',
          stroke: obj.color,
          strokeWidth: 1.5,
          cornerRadius: 8,
        });
        tag.setAttr('annotationId', obj.id);
        const txt = new Konva.Text({
          text: obj.text,
          fontSize: fontPx,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontStyle: 'bold',
          fill: obj.color,
          padding: 6,
        });
        txt.setAttr('annotationId', obj.id);
        label.add(tag);
        label.add(txt);
        layer.add(label);
      }
    });

    layer.batchDraw();
  }, []);

  // Render live in-progress strokes & remote cursors onto liveLayer
  const redrawLiveLayer = useCallback(() => {
    const layer = liveLayerRef.current;
    const stage = stageRef.current;
    if (!layer || !stage) return;

    const w = stage.width();
    const h = stage.height();
    const scaleFactor = Math.max(0.55, w / 1000);
    const now = Date.now();

    layer.destroyChildren();

    const previews: AnnotationStrokePreview[] = [];
    if (localDraftRef.current) previews.push(localDraftRef.current);
    remotePreviewsRef.current.forEach((p, key) => {
      if (now - p.updatedAt > 4500) {
        remotePreviewsRef.current.delete(key);
        return;
      }
      previews.push(p);
    });

    previews.forEach((p) => {
      if ((p.tool === 'pen' || p.tool === 'highlighter') && p.points && p.points.length >= 2) {
        const pxPoints: number[] = [];
        for (let i = 0; i < p.points.length; i += 2) {
          pxPoints.push(p.points[i] * w, p.points[i + 1] * h);
        }
        layer.add(
          new Konva.Line({
            points: pxPoints,
            stroke: p.color,
            strokeWidth: Math.max(2, p.strokeWidth * scaleFactor),
            opacity: p.opacity,
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.35,
            listening: false,
          })
        );
      } else if (
        p.tool === 'arrow' &&
        p.x1 !== undefined &&
        p.y1 !== undefined &&
        p.x2 !== undefined &&
        p.y2 !== undefined
      ) {
        const sw = Math.max(2, p.strokeWidth * scaleFactor);
        layer.add(
          new Konva.Arrow({
            points: [p.x1 * w, p.y1 * h, p.x2 * w, p.y2 * h],
            stroke: p.color,
            fill: p.color,
            strokeWidth: sw,
            pointerLength: Math.max(10, sw * 2.6),
            pointerWidth: Math.max(9, sw * 2.3),
            opacity: p.opacity,
            lineCap: 'round',
            listening: false,
          })
        );
      } else if (
        p.tool === 'circle' &&
        p.x1 !== undefined &&
        p.y1 !== undefined &&
        p.x2 !== undefined &&
        p.y2 !== undefined
      ) {
        const cx = ((p.x1 + p.x2) / 2) * w;
        const cy = ((p.y1 + p.y2) / 2) * h;
        const rx = Math.max(4, Math.abs(p.x2 - p.x1) * w * 0.5);
        const ry = Math.max(4, Math.abs(p.y2 - p.y1) * h * 0.5);
        layer.add(
          new Konva.Ellipse({
            x: cx,
            y: cy,
            radiusX: rx,
            radiusY: ry,
            stroke: p.color,
            strokeWidth: Math.max(2, p.strokeWidth * scaleFactor),
            opacity: p.opacity,
            listening: false,
          })
        );
      }
    });

    // Remote live cursors
    remoteCursorsRef.current.forEach((cursor, pid) => {
      if (now - cursor.updatedAt > 5000) {
        remoteCursorsRef.current.delete(pid);
        return;
      }
      const cx = cursor.x * w;
      const cy = cursor.y * h;
      layer.add(
        new Konva.Circle({
          x: cx,
          y: cy,
          radius: 5,
          fill: cursor.color,
          stroke: '#FFFFFF',
          strokeWidth: 2,
          listening: false,
        })
      );
      const badge = new Konva.Label({
        x: Math.min(w - 90, cx + 10),
        y: Math.max(4, cy - 12),
        listening: false,
      });
      badge.add(
        new Konva.Tag({
          fill: cursor.color,
          cornerRadius: 6,
          listening: false,
        })
      );
      badge.add(
        new Konva.Text({
          text: cursor.fullName.split(' ')[0] || 'Doctor',
          fontSize: 11,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontStyle: 'bold',
          fill: '#FFFFFF',
          padding: 4,
          listening: false,
        })
      );
      layer.add(badge);
    });

    layer.batchDraw();
  }, []);

  // Periodically prune stale remote cursors/previews
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      if (remoteCursorsRef.current.size > 0 || remotePreviewsRef.current.size > 0) {
        redrawLiveLayer();
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [isOpen, redrawLiveLayer]);

  // Reset modal state whenever opened for a target
  useEffect(() => {
    if (!isOpen || !target) return;
    objectsMapRef.current.clear();
    remotePreviewsRef.current.clear();
    remoteCursorsRef.current.clear();
    localDraftRef.current = null;
    isDrawingRef.current = false;
    setObjects([]);
    setCaption(target.title ? `🩺 ${target.title}` : '🩺 Annotated clinical image');
    setPendingTextCallout(null);
    setCalloutInput('');
    setSaveError(null);
    setPeerSavedBanner(null);
    setConfirmClearAll(false);
  }, [isOpen, target?.sessionKey]);

  // Load medical image safely (with CORS-friendly fallback so canvas export succeeds)
  useEffect(() => {
    if (!isOpen || !target?.imageUrl) return;
    let cancelled = false;

    const cleanupObjectUrl = () => {
      if (objectUrlCleanupRef.current) {
        URL.revokeObjectURL(objectUrlCleanupRef.current);
        objectUrlCleanupRef.current = null;
      }
    };
    cleanupObjectUrl();

    if (!isSafeImageSource(target.imageUrl)) {
      setImageLoading(false);
      setImageError('This image URL cannot be loaded safely for annotation.');
      return;
    }

    setImageLoading(true);
    setImageError(null);
    setImageNaturalSize(null);
    loadedImageRef.current = null;

    const loadImgElement = (src: string, useAnonymousCors: boolean): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new window.Image();
        if (useAnonymousCors) {
          img.crossOrigin = 'anonymous';
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load error'));
        img.src = src;
      });

    (async () => {
      try {
        const img = await loadImgElement(target.imageUrl, true);
        if (cancelled) return;
        loadedImageRef.current = img;
        setImageNaturalSize({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
        setImageLoading(false);
      } catch {
        try {
          const res = await fetch(target.imageUrl, { mode: 'cors' });
          if (!res.ok) throw new Error('Fetch failed');
          const blob = await res.blob();
          if (cancelled) return;
          const objUrl = URL.createObjectURL(blob);
          objectUrlCleanupRef.current = objUrl;
          const img = await loadImgElement(objUrl, false);
          if (cancelled) return;
          loadedImageRef.current = img;
          setImageNaturalSize({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
          setImageLoading(false);
        } catch {
          if (!cancelled) {
            setImageLoading(false);
            setImageError('Could not load this image for canvas annotation (CORS or network error).');
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupObjectUrl();
    };
  }, [isOpen, target?.imageUrl]);

  // Measure available container & fit stage preserving natural medical image aspect ratio
  useEffect(() => {
    if (!isOpen || !imageNaturalSize) return;
    const container = viewportRef.current;
    if (!container) return;

    const recomputeSize = () => {
      const rect = container.getBoundingClientRect();
      const maxW = Math.max(260, rect.width - 16);
      const maxH = Math.max(220, rect.height - 16);
      const ratio = imageNaturalSize.w / Math.max(1, imageNaturalSize.h);

      let width = maxW;
      let height = width / ratio;
      if (height > maxH) {
        height = maxH;
        width = height * ratio;
      }
      setStageSize({
        w: Math.max(220, Math.floor(width)),
        h: Math.max(180, Math.floor(height)),
      });
    };

    recomputeSize();
    const ro = new ResizeObserver(recomputeSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [isOpen, imageNaturalSize]);

  // Initialize Konva Stage inside ref (NEVER in component state) + destroy on unmount
  useEffect(() => {
    if (!isOpen || !imageNaturalSize || !stageContainerRef.current) return;

    const stage = new Konva.Stage({
      container: stageContainerRef.current,
      width: stageSize.w,
      height: stageSize.h,
    });
    const bgLayer = new Konva.Layer({ listening: false });
    const objectsLayer = new Konva.Layer();
    const liveLayer = new Konva.Layer({ listening: false });

    stage.add(bgLayer);
    stage.add(objectsLayer);
    stage.add(liveLayer);

    stageRef.current = stage;
    bgLayerRef.current = bgLayer;
    objectsLayerRef.current = objectsLayer;
    liveLayerRef.current = liveLayer;

    // Helper: read normalized coordinates from current pointer
    const getNormPoint = (): { nx: number; ny: number; px: number; py: number } | null => {
      const pos = stage.getPointerPosition();
      if (!pos) return null;
      const w = stage.width();
      const h = stage.height();
      return {
        nx: Math.max(0, Math.min(1, pos.x / Math.max(1, w))),
        ny: Math.max(0, Math.min(1, pos.y / Math.max(1, h))),
        px: pos.x,
        py: pos.y,
      };
    };

    stage.on('pointerdown', (e) => {
      const pt = getNormPoint();
      if (!pt) return;
      const { activeTool: tool, activeColor: color, strokePreset: preset, myId: uid, myDisplayName: uname } =
        toolStateRef.current;

      if (tool === 'eraser') {
        const hitId =
          e.target && e.target !== stage
            ? ((e.target.attrs as Record<string, unknown> | undefined)?.annotationId as string | undefined)
            : undefined;
        if (hitId && objectsMapRef.current.has(hitId)) {
          objectsMapRef.current.delete(hitId);
          syncObjectsStateFromMap();
          redrawObjectsLayer();
          roomRef.current?.deleteObject(hitId);
        }
        return;
      }

      if (tool === 'text') {
        setPendingTextCallout({
          nx: pt.nx,
          ny: pt.ny,
          leftPx: Math.min(stage.width() - 210, Math.max(8, pt.px)),
          topPx: Math.min(stage.height() - 56, Math.max(8, pt.py)),
        });
        setCalloutInput('');
        return;
      }

      isDrawingRef.current = true;
      const baseWidth = WIDTH_FACTORS[preset];
      const strokeWidth = tool === 'highlighter' ? baseWidth * 3.4 : baseWidth;
      const opacity = tool === 'highlighter' ? 0.36 : 1;
      const strokeId = `${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (tool === 'pen' || tool === 'highlighter') {
        localDraftRef.current = {
          strokeId,
          authorId: uid,
          authorName: uname,
          tool,
          color,
          strokeWidth,
          opacity,
          points: [pt.nx, pt.ny],
        };
      } else {
        localDraftRef.current = {
          strokeId,
          authorId: uid,
          authorName: uname,
          tool,
          color,
          strokeWidth,
          opacity,
          x1: pt.nx,
          y1: pt.ny,
          x2: pt.nx,
          y2: pt.ny,
        };
      }
      redrawLiveLayer();
    });

    stage.on('pointermove', () => {
      const pt = getNormPoint();
      if (!pt) return;
      const { activeTool: tool, myId: uid, myDisplayName: uname } = toolStateRef.current;
      const now = Date.now();

      // Throttled collaborative cursor broadcast
      if (now - lastCursorEmitRef.current >= 55) {
        lastCursorEmitRef.current = now;
        roomRef.current?.sendCursor({
          profileId: uid,
          fullName: uname,
          color: myCollaboratorColor,
          x: pt.nx,
          y: pt.ny,
          tool,
          updatedAt: now,
        });
      }

      if (!isDrawingRef.current || !localDraftRef.current) return;
      const draft = localDraftRef.current;

      if (draft.tool === 'pen' || draft.tool === 'highlighter') {
        const pts = draft.points ?? [];
        const prevX = pts[pts.length - 2] ?? pt.nx;
        const prevY = pts[pts.length - 1] ?? pt.ny;
        // Skip tiny jitter < 0.15% of canvas
        if (Math.hypot(pt.nx - prevX, pt.ny - prevY) < 0.0015) return;
        pts.push(pt.nx, pt.ny);
      } else {
        draft.x2 = pt.nx;
        draft.y2 = pt.ny;
      }

      redrawLiveLayer();

      if (now - lastPreviewEmitRef.current >= 45) {
        lastPreviewEmitRef.current = now;
        roomRef.current?.sendStrokePreview({
          ...draft,
          points: draft.points ? [...draft.points] : undefined,
        });
      }
    });

    const finalizeStroke = () => {
      if (!isDrawingRef.current || !localDraftRef.current) return;
      isDrawingRef.current = false;
      const draft = localDraftRef.current;
      localDraftRef.current = null;
      redrawLiveLayer();

      const now = Date.now();
      let committed: AnnotationObject | null = null;

      if (draft.tool === 'pen' || draft.tool === 'highlighter') {
        const pts = draft.points ?? [];
        if (pts.length === 2) {
          pts.push(pts[0] + 0.002, pts[1] + 0.002);
        }
        committed = {
          id: draft.strokeId,
          authorId: draft.authorId,
          authorName: draft.authorName,
          tool: draft.tool,
          color: draft.color,
          strokeWidth: draft.strokeWidth,
          opacity: draft.opacity,
          points: pts,
          createdAt: now,
        } satisfies FreehandAnnotationObject;
      } else if (
        draft.x1 !== undefined &&
        draft.y1 !== undefined &&
        draft.x2 !== undefined &&
        draft.y2 !== undefined
      ) {
        const dist = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
        if (dist < 0.008) return; // Ignore accidental 0px taps for arrows/circles
        committed = {
          id: draft.strokeId,
          authorId: draft.authorId,
          authorName: draft.authorName,
          tool: draft.tool,
          color: draft.color,
          strokeWidth: draft.strokeWidth,
          opacity: draft.opacity,
          x1: draft.x1,
          y1: draft.y1,
          x2: draft.x2,
          y2: draft.y2,
          createdAt: now,
        } satisfies ShapeAnnotationObject;
      }

      if (committed) {
        objectsMapRef.current.set(committed.id, committed);
        syncObjectsStateFromMap();
        redrawObjectsLayer();
        roomRef.current?.upsertObject(committed);
      }
    };

    stage.on('pointerup', finalizeStroke);
    stage.on('pointerleave', finalizeStroke);

    return () => {
      stage.destroy();
      stageRef.current = null;
      bgLayerRef.current = null;
      objectsLayerRef.current = null;
      liveLayerRef.current = null;
    };
  }, [isOpen, imageNaturalSize, myCollaboratorColor, redrawLiveLayer, redrawObjectsLayer, syncObjectsStateFromMap]);

  // Resize Konva Stage & redraw medical scan + vectors cleanly on viewport resize
  useEffect(() => {
    const stage = stageRef.current;
    const bgLayer = bgLayerRef.current;
    const img = loadedImageRef.current;
    if (!stage || !bgLayer || !img) return;

    stage.width(stageSize.w);
    stage.height(stageSize.h);

    bgLayer.destroyChildren();
    bgLayer.add(
      new Konva.Image({
        image: img,
        x: 0,
        y: 0,
        width: stageSize.w,
        height: stageSize.h,
        listening: false,
      })
    );
    bgLayer.batchDraw();
    redrawObjectsLayer();
    redrawLiveLayer();
  }, [stageSize, imageLoading, redrawObjectsLayer, redrawLiveLayer]);

  // Connect to isolated Supabase Realtime Annotation Room + advertise live session in DM
  useEffect(() => {
    if (!isOpen || !conversationId || !target?.sessionKey || !target?.imageUrl) return;

    const me: AnnotationCollaborator = {
      profileId: myId,
      fullName: myDisplayName || 'SZMC Doctor',
      avatarUrl: myAvatarUrl || '/szmc-logo.png',
      color: myCollaboratorColor,
      joinedAt: new Date().toISOString(),
    };

    const conn = connectAnnotationRoom({
      conversationId,
      sessionKey: target.sessionKey,
      me,
      handlers: {
        onStatusChange: (status) => setRoomStatus(status),
        onCollaboratorsChange: (list) => setCollaborators(list),
        onStrokePreview: (preview) => {
          remotePreviewsRef.current.set(preview.strokeId, {
            ...preview,
            updatedAt: Date.now(),
          });
          redrawLiveLayer();
        },
        onObjectUpsert: (obj) => {
          // Idempotent insert/merge (skip if exact object already applied)
          if (objectsMapRef.current.has(obj.id)) return;
          remotePreviewsRef.current.delete(obj.id);
          objectsMapRef.current.set(obj.id, obj);
          syncObjectsStateFromMap();
          redrawObjectsLayer();
          redrawLiveLayer();
        },
        onObjectDelete: (objectId) => {
          if (!objectsMapRef.current.has(objectId)) return;
          objectsMapRef.current.delete(objectId);
          syncObjectsStateFromMap();
          redrawObjectsLayer();
        },
        onClear: ({ scope, authorId }) => {
          let changed = false;
          if (scope === 'all') {
            if (objectsMapRef.current.size > 0) {
              objectsMapRef.current.clear();
              changed = true;
            }
          } else {
            for (const [id, obj] of objectsMapRef.current) {
              if (obj.authorId === authorId) {
                objectsMapRef.current.delete(id);
                changed = true;
              }
            }
          }
          if (changed) {
            syncObjectsStateFromMap();
            redrawObjectsLayer();
          }
        },
        onCursorMove: (cursor) => {
          remoteCursorsRef.current.set(cursor.profileId, {
            ...cursor,
            updatedAt: Date.now(),
          });
          redrawLiveLayer();
        },
        onSyncRequested: () => {
          const snapshot = sortObjectsChronologically(Array.from(objectsMapRef.current.values()));
          if (snapshot.length > 0) {
            conn.sendSyncState(snapshot, myId);
          }
        },
        onSyncState: ({ objects: incoming }) => {
          let added = false;
          incoming.forEach((obj) => {
            if (!objectsMapRef.current.has(obj.id)) {
              objectsMapRef.current.set(obj.id, obj);
              added = true;
            }
          });
          if (added) {
            syncObjectsStateFromMap();
            redrawObjectsLayer();
          }
        },
        onSavedToThread: ({ saverName }) => {
          setPeerSavedBanner(`${saverName} saved an annotated copy to the DM thread.`);
          playSound('pop');
        },
      },
    });

    roomRef.current = conn;

    // Notify DM peer so they can one-tap "Join Live" from the thread
    const announceActive = () => {
      broadcastDmAnnotationSession(conversationId, {
        sessionKey: target.sessionKey,
        imageUrl: target.imageUrl,
        sourceMessageId: target.sourceMessageId ?? null,
        hostProfileId: myId,
        hostName: myDisplayName || 'SZMC Doctor',
        startedAt: Date.now(),
        active: true,
      });
    };
    announceActive();
    const heartbeat = window.setInterval(announceActive, 12000);

    return () => {
      window.clearInterval(heartbeat);
      broadcastDmAnnotationSession(conversationId, {
        sessionKey: target.sessionKey,
        imageUrl: target.imageUrl,
        sourceMessageId: target.sourceMessageId ?? null,
        hostProfileId: myId,
        hostName: myDisplayName || 'SZMC Doctor',
        startedAt: Date.now(),
        active: false,
      });
      conn.disconnect();
      roomRef.current = null;
    };
  }, [
    isOpen,
    conversationId,
    target?.sessionKey,
    target?.imageUrl,
    target?.sourceMessageId,
    myId,
    myDisplayName,
    myAvatarUrl,
    myCollaboratorColor,
    redrawLiveLayer,
    redrawObjectsLayer,
    syncObjectsStateFromMap,
  ]);

  // Escape closes text callout input first, otherwise closes modal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingTextCallout) {
          setPendingTextCallout(null);
        } else if (!saving) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, pendingTextCallout, saving, onClose]);

  const handleCommitTextCallout = (e: React.FormEvent) => {
    e.preventDefault();
    const text = calloutInput.trim();
    if (!pendingTextCallout || !text) {
      setPendingTextCallout(null);
      return;
    }
    const obj: TextAnnotationObject = {
      id: `${myId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      authorId: myId,
      authorName: myDisplayName || 'SZMC Doctor',
      tool: 'text',
      color: activeColor,
      fontSize: strokePreset === 'fine' ? 14 : strokePreset === 'bold' ? 22 : 17,
      x: pendingTextCallout.nx,
      y: pendingTextCallout.ny,
      text,
      createdAt: Date.now(),
    };
    objectsMapRef.current.set(obj.id, obj);
    syncObjectsStateFromMap();
    redrawObjectsLayer();
    roomRef.current?.upsertObject(obj);
    setPendingTextCallout(null);
    setCalloutInput('');
  };

  const handleUndoMine = () => {
    const mine = sortObjectsChronologically(Array.from(objectsMapRef.current.values())).filter(
      (o) => o.authorId === myId
    );
    const latest = mine[mine.length - 1];
    if (!latest) return;
    objectsMapRef.current.delete(latest.id);
    syncObjectsStateFromMap();
    redrawObjectsLayer();
    roomRef.current?.deleteObject(latest.id);
  };

  const handleClearMine = () => {
    let changed = false;
    for (const [id, obj] of objectsMapRef.current) {
      if (obj.authorId === myId) {
        objectsMapRef.current.delete(id);
        changed = true;
      }
    }
    if (!changed) return;
    syncObjectsStateFromMap();
    redrawObjectsLayer();
    roomRef.current?.clearObjects('author', myId);
  };

  const handleClearAll = () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    setConfirmClearAll(false);
    objectsMapRef.current.clear();
    syncObjectsStateFromMap();
    redrawObjectsLayer();
    roomRef.current?.clearObjects('all', myId);
  };

  const handleSaveAnnotatedImage = async () => {
    const stage = stageRef.current;
    const liveLayer = liveLayerRef.current;
    if (!stage || saving || imageLoading || Boolean(imageError)) return;

    setSaving(true);
    setSaveError(null);
    try {
      if (liveLayer) {
        liveLayer.visible(false);
        liveLayer.batchDraw();
      }
      const pixelRatio = Math.min(2, Math.max(1, 1400 / Math.max(1, stage.width())));
      const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
      if (liveLayer) {
        liveLayer.visible(true);
        liveLayer.batchDraw();
      }

      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], `szmc-annotated-${Date.now()}.png`, { type: 'image/png' });
      const uploadedUrl = await uploadChatImage(file, conversationId);

      const ok = await onSaveToThread({
        mediaUrl: uploadedUrl,
        caption: caption.trim() || '🩺 Annotated clinical image',
        replyToMessageId: target?.sourceMessageId ?? null,
      });

      if (ok) {
        roomRef.current?.notifySaved(myId, myDisplayName || 'Colleague');
        playSound('pop');
        onClose();
      } else {
        setSaveError('Annotated image uploaded, but could not be sent to the thread.');
      }
    } catch (err) {
      if (liveLayer) {
        liveLayer.visible(true);
        liveLayer.batchDraw();
      }
      setSaveError(err instanceof Error ? err.message : 'Could not export or upload the annotated image.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !target) return null;

  const myAnnotationCount = objects.filter((o) => o.authorId === myId).length;
  const remoteCollaborators = collaborators.filter((c) => c.profileId !== myId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/90 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotator-modal-title"
    >
      <div className="w-full max-w-6xl h-[100dvh] sm:h-[92vh] sm:rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Top Clinical Collaboration Header */}
        <div className="px-3.5 sm:px-5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-[#0084FF] text-white flex items-center justify-center shrink-0">
              <Highlighter className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="annotator-modal-title" className="text-sm font-bold text-white truncate">
                  Shared Scan Annotation
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                  <Wifi
                    className={`w-3 h-3 ${
                      roomStatus === 'SUBSCRIBED'
                        ? 'text-emerald-400'
                        : roomStatus === 'CONNECTING'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  />
                  <span>
                    {roomStatus === 'SUBSCRIBED'
                      ? 'Live Sync'
                      : roomStatus === 'CONNECTING'
                      ? 'Connecting...'
                      : 'Reconnecting'}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                DM with {peerName} · Drawings &amp; highlights sync in real time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Supabase Presence Collaborators */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs">
              <Users className="w-3.5 h-3.5 text-[#0084FF] shrink-0" />
              <div className="flex -space-x-1.5">
                {collaborators.slice(0, 3).map((c) => (
                  <img
                    key={c.profileId}
                    src={c.avatarUrl}
                    alt={c.fullName}
                    referrerPolicy="no-referrer"
                    title={c.fullName}
                    className="w-5 h-5 rounded-full object-cover ring-2"
                    style={{ borderColor: c.color }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-semibold text-slate-200 tabular-nums">
                {remoteCollaborators.length > 0
                  ? `${collaborators.length} live (${remoteCollaborators[0].fullName.split(' ')[0]} joined)`
                  : 'Waiting for colleague'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close annotation workspace"
              className="min-w-[40px] min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawing & Highlighting Toolbar */}
        <div className="px-3 sm:px-5 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {/* Tools */}
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'pen', label: 'Pen', icon: Pencil },
                { id: 'highlighter', label: 'Highlight', icon: Highlighter },
                { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
                { id: 'circle', label: 'ROI', icon: Circle },
                { id: 'text', label: 'Label', icon: Type },
                { id: 'eraser', label: 'Erase', icon: Eraser },
              ] as const
            ).map((tool) => {
              const Icon = tool.icon;
              const selected = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setActiveTool(tool.id);
                    setPendingTextCallout(null);
                  }}
                  aria-pressed={selected}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#0084FF] text-white shadow-xs'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tool.label}</span>
                </button>
              );
            })}
          </div>

          {/* Color Palette & Stroke Size */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5" role="group" aria-label="Annotation colors">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => setActiveColor(swatch.hex)}
                  title={swatch.label}
                  aria-label={swatch.label}
                  aria-pressed={activeColor === swatch.hex}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    activeColor === swatch.hex
                      ? 'scale-115 border-white ring-2 ring-[#0084FF]'
                      : 'border-slate-600 hover:scale-105'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>

            <div className="flex items-center p-0.5 rounded-xl bg-slate-800 border border-slate-700">
              {(['fine', 'medium', 'bold'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStrokePreset(preset)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
                    strokePreset === preset
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Undo & Clear */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndoMine}
                disabled={myAnnotationCount === 0}
                title="Undo my last mark"
                className="min-h-[36px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Undo</span>
              </button>
              {myAnnotationCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearMine}
                  title="Clear my marks"
                  className="min-h-[36px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Clear Mine
                </button>
              )}
              {objects.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className={`min-h-[36px] px-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                    confirmClearAll
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-rose-300'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{confirmClearAll ? 'Confirm Clear' : 'Clear All'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Peer Saved Notice */}
        {peerSavedBanner && (
          <div className="px-4 py-2 bg-emerald-950/70 border-b border-emerald-800/80 text-xs text-emerald-200 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Check className="w-4 h-4 text-emerald-400" />
              {peerSavedBanner}
            </span>
            <button
              type="button"
              onClick={() => setPeerSavedBanner(null)}
              className="text-emerald-300 hover:text-white cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Interactive Konva Canvas Viewport */}
        <div
          ref={viewportRef}
          className="flex-1 min-h-0 relative flex items-center justify-center bg-slate-950 overflow-hidden p-2 sm:p-4 select-none"
        >
          {imageLoading ? (
            <div className="flex flex-col items-center gap-2 text-slate-300">
              <Loader2 className="w-7 h-7 animate-spin text-[#0084FF]" />
              <p className="text-xs font-medium">Loading clinical image onto shared canvas...</p>
            </div>
          ) : imageError ? (
            <div className="max-w-md p-5 rounded-2xl bg-slate-900 border border-rose-800/70 text-center space-y-2">
              <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
              <p className="text-sm font-bold text-white">Unable to open image on canvas</p>
              <p className="text-xs text-slate-400">{imageError}</p>
            </div>
          ) : (
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-slate-700/80 bg-black"
              style={{
                width: stageSize.w,
                height: stageSize.h,
                touchAction: 'none',
                cursor:
                  activeTool === 'eraser'
                    ? 'pointer'
                    : activeTool === 'text'
                    ? 'text'
                    : 'crosshair',
              }}
            >
              <div ref={stageContainerRef} className="w-full h-full" />

              {/* Inline Text Callout Input Popover */}
              {pendingTextCallout && (
                <form
                  onSubmit={handleCommitTextCallout}
                  style={{ left: pendingTextCallout.leftPx, top: pendingTextCallout.topPx }}
                  className="absolute z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/95 border border-[#0084FF] shadow-xl"
                >
                  <input
                    type="text"
                    autoFocus
                    maxLength={60}
                    value={calloutInput}
                    onChange={(e) => setCalloutInput(e.target.value)}
                    placeholder="e.g. ST↑ V2-V4"
                    className="w-40 px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-white placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-[#0084FF] hover:bg-[#0073E6] text-white text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingTextCallout(null)}
                    aria-label="Cancel callout"
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer: Caption & Save Annotated Composite to DM Thread */}
        <div className="px-3.5 sm:px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {saveError && (
              <p className="text-xs text-rose-400 font-medium truncate">{saveError}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={240}
                placeholder="Clinical note or caption for the annotated image..."
                aria-label="Caption for annotated image"
                className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-400 outline-none focus:border-[#0084FF]"
              />
              <span className="hidden md:inline text-[11px] text-slate-400 tabular-nums shrink-0">
                {objects.length} {objects.length === 1 ? 'mark' : 'marks'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[40px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAnnotatedImage()}
              disabled={saving || imageLoading || Boolean(imageError)}
              className="min-h-[40px] px-4 rounded-xl bg-[#0084FF] hover:bg-[#0073E6] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving to Thread...' : 'Save Annotated Image to DM'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
