export interface ChatPerson {
  profileId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  profession: string;
  verificationStatus?: string;
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
  /** public.messages.media_url (image attachments stored as public URLs) */
  mediaUrl?: string | null;
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
