export interface ChatPerson {
  profileId: number;
  fullName: string;
  avatarUrl: string;
  batchYear: number;
  profession: string;
}

export interface ChatConversation {
  id: string;
  person: ChatPerson;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFromMe: boolean;
  unreadCount: number;
  isMuted: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}
