import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type ApiResponse<T> = { status: number; body: T; cookie?: string };
type User = { id: string; photoPath?: string | null };
type Conversation = { id: string };
type SenateConversation = Conversation & { senateId: string };
type Attachment = { id: string };
type MessageResponse = { message: { attachments: Array<{ previewUrl?: string }> } };
type Invitation = { id: string };

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
let tempDir = "";
let baseUrl = "";
let serverProcess: ChildProcess | undefined;

function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

function runScript(script: string, env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script], { cwd: root, env, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/not-a-route`);
      if (response.status === 404) return;
    } catch {
      // The server has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start.");
}

async function api<T>(method: string, route: string, body?: unknown, cookie?: string): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  return { status: response.status, body: await response.json() as T, cookie: setCookie };
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "senatoroom-api-test-"));
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: path.join(tempDir, "senatoroom.sqlite"),
    UPLOAD_DIR: path.join(tempDir, "uploads"),
    BACKUP_DIR: path.join(tempDir, "backups"),
    ADMIN_PHONE: "5533772801",
    JWT_SECRET: "test-jwt-secret",
    MESSAGE_ENCRYPTION_KEY: "test-message-encryption-key"
  };
  await runScript("server/db/migrate.ts", env);
  serverProcess = spawn(process.execPath, [tsxCli, "server/index.ts"], { cwd: root, env, stdio: "ignore" });
  await waitForServer();
}, 15_000);

afterAll(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    const exited = new Promise<void>((resolve) => serverProcess?.once("exit", () => resolve()));
    serverProcess.kill();
    await exited;
  }
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe("messaging API", () => {
  it("keeps conversations private, protects attachments, and orders active conversations first", async () => {
    const alice = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772801", password: "test-password", displayName: "Alice"
    });
    const bob = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772802", password: "test-password", displayName: "Bob"
    });
    const carol = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772803", password: "test-password", displayName: "Carol"
    });
    const dana = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772804", password: "test-password", displayName: "Dana"
    });
    expect(alice.status).toBe(201);
    expect(bob.status).toBe(201);
    expect(carol.status).toBe(201);
    expect(dana.status).toBe(201);

    const firstPhotoForm = new FormData();
    firstPhotoForm.append("photo", new Blob(["<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"><rect width=\"1\" height=\"1\" fill=\"red\"/></svg>"], { type: "image/svg+xml" }), "profile.svg");
    const firstPhoto = await api<{ photoPath: string }>("POST", "/api/me/photo", firstPhotoForm, alice.cookie);
    expect(firstPhoto.status).toBe(200);
    expect(firstPhoto.body.photoPath).toMatch(/^\/uploads\/.+\.webp$/);
    await expect(access(path.join(tempDir, "uploads", path.basename(firstPhoto.body.photoPath)))).resolves.toBeUndefined();

    const secondPhotoForm = new FormData();
    secondPhotoForm.append("photo", new Blob(["<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"><rect width=\"1\" height=\"1\" fill=\"blue\"/></svg>"], { type: "image/svg+xml" }), "profile.svg");
    const secondPhoto = await api<{ photoPath: string }>("POST", "/api/me/photo", secondPhotoForm, alice.cookie);
    expect(secondPhoto.status).toBe(200);
    expect(secondPhoto.body.photoPath).not.toBe(firstPhoto.body.photoPath);
    await expect(access(path.join(tempDir, "uploads", path.basename(firstPhoto.body.photoPath)))).rejects.toThrow();

    const refreshedProfile = await api<{ user: User }>("GET", "/api/me", undefined, alice.cookie);
    expect(refreshedProfile.body.user.photoPath).toBe(secondPhoto.body.photoPath);

    const wildcardSearch = await api<{ members: User[] }>("GET", "/api/members?query=%25", undefined, alice.cookie);
    expect(wildcardSearch.status).toBe(200);
    expect(wildcardSearch.body.members).toEqual([]);

    const firstConversation = await api<{ conversation: Conversation }>("POST", "/api/dm", { memberId: bob.body.user.id }, alice.cookie);
    const secondConversation = await api<{ conversation: Conversation }>("POST", "/api/dm", { memberId: carol.body.user.id }, alice.cookie);
    expect(firstConversation.status).toBe(201);
    expect(secondConversation.status).toBe(201);

    const senate = await api<{ conversation: SenateConversation }>("POST", "/api/senates", {
      name: "Audit Senate", description: "", memberIds: JSON.stringify([bob.body.user.id])
    }, alice.cookie);
    expect(senate.status).toBe(201);
    const permissionEscalation = await api("POST", `/api/senates/${senate.body.conversation.senateId}/permissions`, {
      memberId: alice.body.user.id, canInvite: false
    }, bob.cookie);
    expect(permissionEscalation.status).toBe(403);

    const pendingInvites = await api<{ invites: Invitation[] }>("GET", "/api/invites", undefined, bob.cookie);
    expect(pendingInvites.status).toBe(200);
    expect(pendingInvites.body.invites).toHaveLength(1);
    const beforeAcceptance = await api("GET", `/api/conversations/${senate.body.conversation.id}/messages`, undefined, bob.cookie);
    expect(beforeAcceptance.status).toBe(403);
    const acceptedInvite = await api<{ conversation: Conversation }>("POST", `/api/invites/${pendingInvites.body.invites[0]!.id}/respond`, { action: "accept" }, bob.cookie);
    expect(acceptedInvite.status).toBe(200);
    expect(acceptedInvite.body.conversation.id).toBe(senate.body.conversation.id);
    const accessibleAfterAcceptance = await api("GET", `/api/conversations/${senate.body.conversation.id}/messages`, undefined, bob.cookie);
    expect(accessibleAfterAcceptance.status).toBe(200);

    const leftSenate = await api("POST", `/api/senates/${senate.body.conversation.senateId}/leave`, {}, bob.cookie);
    expect(leftSenate.status).toBe(200);
    const listedAfterLeave = await api<{ conversations: Conversation[] }>("GET", "/api/conversations", undefined, bob.cookie);
    expect(listedAfterLeave.body.conversations.map((conversation) => conversation.id)).not.toContain(senate.body.conversation.id);
    const inaccessibleAfterLeave = await api("GET", `/api/conversations/${senate.body.conversation.id}/messages`, undefined, bob.cookie);
    expect(inaccessibleAfterLeave.status).toBe(403);

    const blockedSenate = await api<{ conversation: SenateConversation }>("POST", "/api/senates", {
      name: "Blocked Senate", description: "", memberIds: JSON.stringify([carol.body.user.id])
    }, alice.cookie);
    const carolInvites = await api<{ invites: Invitation[] }>("GET", "/api/invites", undefined, carol.cookie);
    const blocked = await api("POST", `/api/invites/${carolInvites.body.invites[0]!.id}/respond`, { action: "block" }, carol.cookie);
    expect(blocked.status).toBe(200);
    const reinviteBlockedUser = await api("POST", `/api/senates/${blockedSenate.body.conversation.senateId}/invites`, { memberId: carol.body.user.id }, alice.cookie);
    expect(reinviteBlockedUser.status).toBe(403);

    const declinedSenate = await api<{ conversation: SenateConversation }>("POST", "/api/senates", {
      name: "Declined Senate", description: "", memberIds: JSON.stringify([dana.body.user.id])
    }, alice.cookie);
    const danaInvites = await api<{ invites: Invitation[] }>("GET", "/api/invites", undefined, dana.cookie);
    const declined = await api("POST", `/api/invites/${danaInvites.body.invites[0]!.id}/respond`, { action: "decline" }, dana.cookie);
    expect(declined.status).toBe(200);
    const reinviteDeclinedUser = await api("POST", `/api/senates/${declinedSenate.body.conversation.senateId}/invites`, { memberId: dana.body.user.id }, alice.cookie);
    expect(reinviteDeclinedUser.status).toBe(200);

    const forbiddenRead = await api("GET", `/api/conversations/${firstConversation.body.conversation.id}/messages`, undefined, carol.cookie);
    expect(forbiddenRead.status).toBe(403);

    const form = new FormData();
    form.append("conversationId", firstConversation.body.conversation.id);
    form.append("file", new Blob(["test attachment"], { type: "text/plain" }), "audit.txt");
    const upload = await api<{ attachment: Attachment }>("POST", "/api/attachments", form, alice.cookie);
    expect(upload.status).toBe(201);

    const foreignAttachment = await api("POST", `/api/messages/${firstConversation.body.conversation.id}`, {
      body: "This must fail", attachmentIds: [upload.body.attachment.id]
    }, bob.cookie);
    expect(foreignAttachment.status).toBe(400);

    const sentMessage = await api<MessageResponse>("POST", `/api/messages/${firstConversation.body.conversation.id}`, {
      body: "Latest message", attachmentIds: [upload.body.attachment.id]
    }, alice.cookie);
    expect(sentMessage.status).toBe(201);
    expect(sentMessage.body.message.attachments[0]?.previewUrl).toBeUndefined();

    const conversations = await api<{ conversations: Conversation[] }>("GET", "/api/conversations", undefined, alice.cookie);
    expect(conversations.status).toBe(200);
    expect(conversations.body.conversations[0]?.id).toBe(firstConversation.body.conversation.id);

    const backup = await api<{ ok: boolean; path: string }>("POST", "/api/admin/backup", {}, alice.cookie);
    expect(backup.status).toBe(200);
    expect(backup.body.ok).toBe(true);
    await expect(access(path.join(backup.body.path, "senatoroom.sqlite"))).resolves.toBeUndefined();
  });

  it("persists modern messaging preferences, reactions, governance, blocks, and deletion tombstones", async () => {
    const alice = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772951", password: "test-password", displayName: "Preferences Alice"
    });
    const bob = await api<{ user: User }>("POST", "/api/auth/register", {
      phone: "5533772952", password: "test-password", displayName: "Preferences Bob"
    });
    expect(alice.status).toBe(201);
    expect(bob.status).toBe(201);

    const dm = await api<{ conversation: Conversation }>("POST", "/api/dm", { memberId: bob.body.user.id }, alice.cookie);
    const first = await api<{ message: { id: string; reactions: Array<{ emoji: string; count: number }> } }>("POST", `/api/messages/${dm.body.conversation.id}`, {
      body: "Aranabilir plan notu", attachmentIds: []
    }, alice.cookie);
    const reply = await api<{ message: { replyTo: { id: string } | null } }>("POST", `/api/messages/${dm.body.conversation.id}`, {
      body: "Bu mesaja yanıt", attachmentIds: [], replyToMessageId: first.body.message.id
    }, bob.cookie);
    expect(reply.status).toBe(201);
    expect(reply.body.message.replyTo?.id).toBe(first.body.message.id);

    const reaction = await api<{ message: { reactions: Array<{ emoji: string; count: number }> } }>("POST", `/api/messages/${first.body.message.id}/reactions`, { emoji: "👍" }, bob.cookie);
    expect(reaction.status).toBe(201);
    expect(reaction.body.message.reactions).toContainEqual(expect.objectContaining({ emoji: "👍", count: 1 }));

    const search = await api<{ messages: Array<{ id: string }> }>("GET", `/api/conversations/${dm.body.conversation.id}/messages/search?query=plan`, undefined, alice.cookie);
    expect(search.status).toBe(200);
    expect(search.body.messages.map((message) => message.id)).toContain(first.body.message.id);

    const muted = await api<{ conversation: { notificationLevel: string; mutedUntil: string | null } }>("PATCH", `/api/conversations/${dm.body.conversation.id}/preferences`, {
      notificationLevel: "mentions", mutedUntil: "2030-01-01T00:00:00.000Z"
    }, alice.cookie);
    expect(muted.status).toBe(200);
    expect(muted.body.conversation.notificationLevel).toBe("mentions");
    expect(muted.body.conversation.mutedUntil).toContain("2030-01-01");

    const block = await api("POST", "/api/me/blocks", { memberId: bob.body.user.id }, alice.cookie);
    expect(block.status).toBe(201);
    const blockedSend = await api("POST", `/api/messages/${dm.body.conversation.id}`, { body: "blocked", attachmentIds: [] }, bob.cookie);
    expect(blockedSend.status).toBe(403);

    const senate = await api<{ conversation: SenateConversation }>("POST", "/api/senates", {
      name: "Governance Senate", description: "", memberIds: JSON.stringify([bob.body.user.id])
    }, alice.cookie);
    const invite = await api<{ invites: Invitation[] }>("GET", "/api/invites", undefined, bob.cookie);
    await api("POST", `/api/invites/${invite.body.invites.at(-1)!.id}/respond`, { action: "accept" }, bob.cookie);
    const transfer = await api<{ conversation: { createdById: string } }>("POST", `/api/senates/${senate.body.conversation.senateId}/owner`, { memberId: bob.body.user.id }, alice.cookie);
    expect(transfer.status).toBe(200);
    expect(transfer.body.conversation.createdById).toBe(bob.body.user.id);

    const removeReaction = await api("DELETE", `/api/messages/${first.body.message.id}/reactions/${encodeURIComponent("👍")}`, undefined, bob.cookie);
    expect(removeReaction.status).toBe(200);
    const deleteAccount = await api("DELETE", "/api/me", { password: "test-password" }, alice.cookie);
    expect(deleteAccount.status).toBe(200);
    const oldLogin = await api("POST", "/api/auth/login", { phone: "5533772951", password: "test-password" });
    expect(oldLogin.status).toBe(401);
  });
});
