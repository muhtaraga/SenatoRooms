import type { Attachment, Conversation, Invitation, Member, Message, User } from "./types";

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Istek basarisiz.");
  }
  return payload as T;
}

export const api = {
  me: () => request<{ user: User }>("/api/me"),
  register: (body: { phone: string; password: string; displayName: string }) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { phone: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  updateProfile: (body: { displayName: string; bio: string }) =>
    request<{ user: User }>("/api/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return request<{ photoPath: string }>("/api/me/photo", { method: "POST", body: form });
  },
  members: (query: string) => request<{ members: Member[] }>(`/api/members?query=${encodeURIComponent(query)}`),
  member: (id: string) => request<{ member: Member }>(`/api/members/${id}`),
  conversations: () => request<{ conversations: Conversation[] }>("/api/conversations"),
  invites: () => request<{ invites: Invitation[] }>("/api/invites"),
  respondToInvite: (id: string, action: "accept" | "decline" | "block") =>
    request<{ status?: "declined" | "blocked"; conversation?: Conversation }>(`/api/invites/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ action })
    }),
  messages: (conversationId: string, before?: string | null) =>
    request<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }>(`/api/conversations/${conversationId}/messages?limit=30${before ? `&before=${encodeURIComponent(before)}` : ""}`),
  createDm: (memberId: string) =>
    request<{ conversation: Conversation }>("/api/dm", {
      method: "POST",
      body: JSON.stringify({ memberId })
    }),
  createSenate: (input: { name: string; description: string; memberIds: string[]; photo?: File }) => {
    const form = new FormData();
    form.append("name", input.name);
    form.append("description", input.description);
    form.append("memberIds", JSON.stringify(input.memberIds));
    if (input.photo) form.append("photo", input.photo);
    return request<{ conversation: Conversation }>("/api/senates", { method: "POST", body: form });
  },
  updateSenate: (id: string, input: { name: string; description: string; photo?: File }) => {
    const form = new FormData();
    form.append("name", input.name);
    form.append("description", input.description);
    if (input.photo) form.append("photo", input.photo);
    return request<{ conversation: Conversation }>(`/api/senates/${id}`, { method: "PATCH", body: form });
  },
  inviteToSenate: (senateId: string, memberId: string) =>
    request<{ invite?: Invitation; conversation?: Conversation }>(`/api/senates/${senateId}/invites`, {
      method: "POST",
      body: JSON.stringify({ memberId })
    }),
  setInvitePermission: (senateId: string, memberId: string, canInvite: boolean) =>
    request<{ conversation: Conversation }>(`/api/senates/${senateId}/permissions`, {
      method: "POST",
      body: JSON.stringify({ memberId, canInvite })
    }),
  uploadAttachment: (conversationId: string, file: File) => {
    const form = new FormData();
    form.append("conversationId", conversationId);
    form.append("file", file);
    return request<{ attachment: Attachment }>("/api/attachments", { method: "POST", body: form });
  },
  sendMessage: (conversationId: string, body: string, attachmentIds: string[]) =>
    request<{ message: Message }>(`/api/messages/${conversationId}`, {
      method: "POST",
      body: JSON.stringify({ body, attachmentIds })
    }),
  editMessage: (id: string, body: string) =>
    request<{ message: Message }>(`/api/messages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body })
    }),
  deleteMessage: (id: string) =>
    request<{ message: Message }>(`/api/messages/${id}`, { method: "DELETE" }),
  markRead: (id: string) => request<{ message: Message }>(`/api/messages/${id}/read`, { method: "POST" }),
  backup: () => request<{ ok: boolean; path: string }>("/api/admin/backup", { method: "POST" })
};
