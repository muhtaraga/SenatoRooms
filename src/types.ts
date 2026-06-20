export type User = {
  id: string;
  phone: string;
  displayName: string;
  role: "member" | "owner";
  photoPath: string | null;
  bio: string;
  adminAccess: boolean;
};

export type Member = User;

export type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url?: string;
  previewUrl?: string;
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
};

export type Conversation = {
  id: string;
  type: "dm" | "senate";
  title: string;
  senateId: string | null;
  description: string;
  photoPath: string | null;
  createdById: string | null;
  canEdit: boolean;
  canInvite: boolean;
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
