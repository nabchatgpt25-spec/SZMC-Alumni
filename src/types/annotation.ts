export type AnnotationTool = 'pen' | 'highlighter' | 'arrow' | 'circle' | 'text' | 'eraser';

export type AnnotationStrokeWidth = 'fine' | 'medium' | 'bold';

export interface BaseAnnotationObject {
  id: string;
  authorId: number;
  authorName: string;
  color: string;
  createdAt: number;
}

export interface FreehandAnnotationObject extends BaseAnnotationObject {
  tool: 'pen' | 'highlighter';
  /** Normalized coordinates [x1, y1, x2, y2, ...] in 0..1 space */
  points: number[];
  /** Relative stroke width (fraction of 1000px reference dimension) */
  strokeWidth: number;
  opacity: number;
}

export interface ShapeAnnotationObject extends BaseAnnotationObject {
  tool: 'arrow' | 'circle';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  opacity: number;
}

export interface TextAnnotationObject extends BaseAnnotationObject {
  tool: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type AnnotationObject =
  | FreehandAnnotationObject
  | ShapeAnnotationObject
  | TextAnnotationObject;

export interface AnnotationStrokePreview {
  strokeId: string;
  authorId: number;
  authorName: string;
  tool: 'pen' | 'highlighter' | 'arrow' | 'circle';
  color: string;
  strokeWidth: number;
  opacity: number;
  points?: number[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface AnnotationCursor {
  profileId: number;
  fullName: string;
  color: string;
  x: number;
  y: number;
  tool: AnnotationTool;
  updatedAt: number;
}

export interface AnnotationCollaborator {
  profileId: number;
  fullName: string;
  avatarUrl: string;
  color: string;
  joinedAt: string;
}

export interface ActiveDmAnnotationSession {
  conversationId: string;
  sessionKey: string;
  imageUrl: string;
  sourceMessageId?: string | null;
  hostProfileId: number;
  hostName: string;
  startedAt: number;
  active: boolean;
}

export interface AnnotationTarget {
  sessionKey: string;
  imageUrl: string;
  sourceMessageId?: string | null;
  title?: string;
}
