export interface ChatPerson {
  profileId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  profession: string;
  verificationStatus?: string;
  /** Last recorded activity timestamp from public.profiles.last_seen_at */
  lastSeenAt?: string | null;
}

export interface ChatConversation {
  id: string;
  person: ChatPerson;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFromMe: boolean;
  unreadCount: number;
  isMuted: boolean;
  type?: 'direct' | 'group' | 'announcement';
  title?: string | null;
  /** Participant count (used for group chats) */
  participantCount?: number;
  /** Latest timestamp when the direct counterpart read this conversation */
  peerLastReadAt?: string | null;
  /** True when the current user has blocked the peer in a direct conversation */
  isBlockedByMe?: boolean;
  /** True when either participant in a direct conversation has blocked the other */
  isBlockedEitherWay?: boolean;
}

export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export interface MessageReaction {
  messageId: string;
  profileId: number;
  emoji: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** public.messages.type: 'text' | 'like' | 'system' | 'image' */
  type?: string;
  /** public.messages.media_url (image attachments stored as public URLs or compressed data URLs) */
  mediaUrl?: string | null;
  /** Optional quoted/replied-to message ID */
  replyToMessageId?: string | null;
  /** Client-side delivery state for optimistic messages */
  status?: MessageDeliveryStatus;
  /** Client-only temporary ID used before server reconciliation */
  clientTempId?: string;
}

export interface MessageChangeMeta {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
}

export interface ReactionChangeEvent {
  eventType: 'INSERT' | 'DELETE';
  reaction: MessageReaction;
}

export interface ReadReceiptEvent {
  conversationId: string;
  profileId: number;
  lastReadAt: string;
}

export interface OnlinePresenceUser {
  profileId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  onlineAt: string;
}

export interface UserMessageSettings {
  profileId: number;
  whoCanMessage: 'everyone' | 'verified_only' | 'batch_only';
  readReceiptsEnabled: boolean;
  soundEnabled: boolean;
  notificationPreviewEnabled: boolean;
  emailNotificationDigest: boolean;
  updatedAt?: string;
}
