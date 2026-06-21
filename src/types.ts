export type Theme = "system" | "light" | "dark";
export type NotificationLevel = "all" | "mentions" | "none";

export type User = {
  id: string;
  phone: string;
  displayName: string;
  role: "member" | "owner";
  photoPath: string | null;
  bio: string;
  deleted?: boolean;
  adminAccess: boolean;
};

export type Member = User;

export type UserSettings = {
  userId: string;
  theme: Theme;
  reduceMotion: boolean;
  readReceipts: boolean;
  showOnlineStatus: boolean;
  soundEnabled: boolean;
  toastsEnabled: boolean;
  badgesEnabled: boolean;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url?: string;
  previewUrl?: string;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type MessageReply = {
  id: string;
  senderName: string;
  body: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  readCount: number;
  attachments: Attachment[];
  replyTo: MessageReply | null;
  reactions: MessageReaction[];
};

export type Conversation = {
  id: string;
  viewerId: string;
  type: "dm" | "senate";
  title: string;
  senateId: string | null;
  description: string;
  photoPath: string | null;
  createdById: string | null;
  canEdit: boolean;
  canInvite: boolean;
  unreadCount: number;
  archivedAt: string | null;
  notificationLevel: NotificationLevel;
  mutedUntil: string | null;
  members: Array<{
    id: string;
    phone: string;
    displayName: string;
    photoPath: string | null;
    canInvite: boolean;
  }>;
  latestMessage: Message | null;
};

export type Invitation = {
  id: string;
  senateId: string;
  name: string;
  description: string;
  photoPath: string | null;
  invitedByName: string;
  memberCount: number;
  createdAt: string;
};
