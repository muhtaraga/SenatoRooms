import type {
  Attachment,
  Conversation,
  Invitation,
  Member,
  Message,
  NotificationLevel,
  Theme,
  User,
  UserSettings
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly url: string, public readonly retryable: boolean) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include",
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Sunucuya bağlanılamadı. Lütfen tekrar deneyin.", null, url, true);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error ?? "İstek başarısız.", response.status, url, response.status >= 500);
  return payload as T;
}

export const api = {
  me: () => request<{ user: User }>("/api/me"),
  register: (body: { phone: string; password: string; displayName: string }) => request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { phone: string; password: string }) => request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateProfile: (body: { displayName: string; bio: string }) => request<{ user: User }>("/api/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
  settings: () => request<{ settings: UserSettings }>("/api/me/settings"),
  updateSettings: (body: Partial<Omit<UserSettings, "userId" | "updatedAt">>) => request<{ settings: UserSettings }>("/api/me/settings", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<{ ok: boolean }>("/api/me/password", { method: "PATCH", body: JSON.stringify(body) }),
  deleteAccount: (password: string) => request<{ ok: boolean }>("/api/me", { method: "DELETE", body: JSON.stringify({ password }) }),
  uploadPhoto: (file: File) => {
    const form = new FormData(); form.append("photo", file);
    return request<{ photoPath: string }>("/api/me/photo", { method: "POST", body: form });
  },
  members: (query: string) => request<{ members: Member[] }>(`/api/members?query=${encodeURIComponent(query)}`),
  member: (id: string) => request<{ member: Member }>(`/api/members/${id}`),
  blocks: () => request<{ members: Member[] }>("/api/me/blocks"),
  block: (memberId: string) => request<{ ok: boolean }>("/api/me/blocks", { method: "POST", body: JSON.stringify({ memberId }) }),
  unblock: (memberId: string) => request<{ ok: boolean }>(`/api/me/blocks/${memberId}`, { method: "DELETE" }),
  conversations: (archived = false) => request<{ conversations: Conversation[] }>(`/api/conversations${archived ? "?archived=true" : ""}`),
  invites: () => request<{ invites: Invitation[] }>("/api/invites"),
  respondToInvite: (id: string, action: "accept" | "decline" | "block") => request<{ status?: "declined" | "blocked"; conversation?: Conversation }>(`/api/invites/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) }),
  messages: (conversationId: string, before?: string | null, signal?: AbortSignal) => request<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }>(`/api/conversations/${conversationId}/messages?limit=30${before ? `&before=${encodeURIComponent(before)}` : ""}`, { signal }),
  searchMessages: (conversationId: string, input: { query: string; senderId?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams({ query: input.query });
    if (input.senderId) params.set("senderId", input.senderId);
    if (input.from) params.set("from", input.from);
    if (input.to) params.set("to", input.to);
    return request<{ messages: Message[] }>(`/api/conversations/${conversationId}/messages/search?${params}`);
  },
  updateConversationPreferences: (id: string, body: { notificationLevel?: NotificationLevel; mutedUntil?: string | null; archived?: boolean; clear?: boolean }) => request<{ conversation: Conversation }>(`/api/conversations/${id}/preferences`, { method: "PATCH", body: JSON.stringify(body) }),
  media: (id: string) => request<{ attachments: Attachment[] }>(`/api/conversations/${id}/media`),
  createDm: (memberId: string) => request<{ conversation: Conversation }>("/api/dm", { method: "POST", body: JSON.stringify({ memberId }) }),
  createSenate: (input: { name: string; description: string; memberIds: string[]; photo?: File }) => {
    const form = new FormData(); form.append("name", input.name); form.append("description", input.description); form.append("memberIds", JSON.stringify(input.memberIds)); if (input.photo) form.append("photo", input.photo);
    return request<{ conversation: Conversation }>("/api/senates", { method: "POST", body: form });
  },
  updateSenate: (id: string, input: { name: string; description: string; photo?: File }) => {
    const form = new FormData(); form.append("name", input.name); form.append("description", input.description); if (input.photo) form.append("photo", input.photo);
    return request<{ conversation: Conversation }>(`/api/senates/${id}`, { method: "PATCH", body: form });
  },
  inviteToSenate: (senateId: string, memberId: string) => request<{ invite?: Invitation; conversation?: Conversation }>(`/api/senates/${senateId}/invites`, { method: "POST", body: JSON.stringify({ memberId }) }),
  setInvitePermission: (senateId: string, memberId: string, canInvite: boolean) => request<{ conversation: Conversation }>(`/api/senates/${senateId}/permissions`, { method: "POST", body: JSON.stringify({ memberId, canInvite }) }),
  leaveSenate: (senateId: string) => request<{ ok: boolean }>(`/api/senates/${senateId}/leave`, { method: "POST" }),
  removeSenateMember: (senateId: string, memberId: string) => request<{ ok: boolean }>(`/api/senates/${senateId}/members/${memberId}`, { method: "DELETE" }),
  transferSenateOwnership: (senateId: string, memberId: string) => request<{ conversation: Conversation }>(`/api/senates/${senateId}/owner`, { method: "POST", body: JSON.stringify({ memberId }) }),
  deleteSenate: (senateId: string) => request<{ ok: boolean }>(`/api/senates/${senateId}`, { method: "DELETE" }),
  uploadAttachment: (conversationId: string, file: File) => { const form = new FormData(); form.append("conversationId", conversationId); form.append("file", file); return request<{ attachment: Attachment }>("/api/attachments", { method: "POST", body: form }); },
  sendMessage: (conversationId: string, body: string, attachmentIds: string[], replyToMessageId?: string | null) => request<{ message: Message }>(`/api/messages/${conversationId}`, { method: "POST", body: JSON.stringify({ body, attachmentIds, replyToMessageId }) }),
  editMessage: (id: string, body: string) => request<{ message: Message }>(`/api/messages/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  deleteMessage: (id: string) => request<{ message: Message }>(`/api/messages/${id}`, { method: "DELETE" }),
  markRead: (id: string) => request<{ message: Message }>(`/api/messages/${id}/read`, { method: "POST" }),
  react: (id: string, emoji: string) => request<{ message: Message }>(`/api/messages/${id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }),
  unreact: (id: string, emoji: string) => request<{ message: Message }>(`/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" }),
  backup: () => request<{ ok: boolean; path: string }>("/api/admin/backup", { method: "POST" })
};
