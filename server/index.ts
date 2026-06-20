import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import { and, asc, desc, eq, inArray, isNull, like, lt, ne, or } from "drizzle-orm";
import express from "express";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { Server } from "socket.io";
import { config } from "./config";
import { db, schema, sqlite } from "./db";
import { clearAuthCookie, requireAuth, readAuthToken, setAuthCookie, signAuthToken, type AuthUser } from "./utils/auth";
import { decryptText, encryptText } from "./utils/crypto";
import { ensureDir, safeStoredName, saveStandardImage } from "./utils/files";
import { normalizeTurkishMobilePhone } from "./utils/phone";

ensureDir(config.uploadDir);
ensureDir(config.backupDir);

const app = express();
const server = http.createServer(app);
const allowedOrigins = [config.clientOrigin, `http://localhost:${config.port}`];
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  next();
});

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadBytes }
});
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Cok fazla istek gonderildi. Lutfen kisa bir sure sonra tekrar deneyin." }
});
const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Cok fazla giris denemesi yapildi. Lutfen daha sonra tekrar deneyin." }
});

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/api", apiRateLimit);

function now() {
  return new Date();
}

function paramString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function publicUser(
  user: typeof schema.users.$inferSelect,
  profile?: typeof schema.profiles.$inferSelect,
  adminAccess = false
) {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    role: user.role,
    photoPath: profile?.photoPath ?? null,
    bio: profile?.bio ?? "",
    adminAccess
  };
}

function getProfile(userId: string) {
  return db.query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) }).sync();
}

function getConversationMember(conversationId: string, userId: string) {
  return db.query.conversationMembers.findFirst({
    where: and(
      eq(schema.conversationMembers.conversationId, conversationId),
      eq(schema.conversationMembers.userId, userId)
    )
  }).sync();
}

function isLocalhostRequest(req: express.Request) {
  const ip = req.socket.remoteAddress ?? "";
  const host = req.hostname.toLowerCase();
  return (host === "localhost" || host === "127.0.0.1" || host === "::1") &&
    (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1");
}

function hasAdminAccess(req: express.Request) {
  return Boolean(config.adminPhone && req.user?.phone === config.adminPhone && isLocalhostRequest(req));
}

function requireLocalAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (hasAdminAccess(req)) {
    next();
    return;
  }
  res.status(403).json({ error: "Admin paneli sadece localhost uzerinden erisilebilir." });
}

function parseMemberIds(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function moveUpload(file: Express.Multer.File) {
  const storedName = safeStoredName(file.originalname);
  fs.renameSync(file.path, path.join(config.uploadDir, storedName));
  return `/uploads/${storedName}`;
}

function isPreviewableMedia(mimeType: string) {
  return ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/ogg"].includes(mimeType);
}

function hasSharedConversation(firstUserId: string, secondUserId: string) {
  return Boolean(
    sqlite
      .prepare(
        `select 1 from conversation_members first_member
         join conversation_members second_member on second_member.conversation_id = first_member.conversation_id
         where first_member.user_id = ? and second_member.user_id = ? limit 1`
      )
      .get(firstUserId, secondUserId)
  );
}

async function cleanupStalePendingAttachments() {
  const cutoff = new Date(Date.now() - config.pendingAttachmentTtlMs);
  const staleAttachments = await db
    .select({ id: schema.attachments.id, storedName: schema.attachments.storedName })
    .from(schema.attachments)
    .where(and(isNull(schema.attachments.messageId), lt(schema.attachments.createdAt, cutoff)));

  for (const attachment of staleAttachments) {
    fs.rmSync(path.join(config.uploadDir, attachment.storedName), { force: true });
  }
  if (staleAttachments.length) {
    await db.delete(schema.attachments).where(inArray(schema.attachments.id, staleAttachments.map((attachment) => attachment.id)));
  }
}

app.get("/uploads/:file", requireAuth, async (req, res) => {
  const file = paramString(req.params.file);
  if (!file || path.basename(file) !== file) {
    res.status(404).end();
    return;
  }

  const photoPath = `/uploads/${file}`;
  const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.photoPath, photoPath) });
  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.photoPath, photoPath) });
  const pendingInvite = senate
    ? await db.query.senateInvites.findFirst({
        where: and(
          eq(schema.senateInvites.senateId, senate.id),
          eq(schema.senateInvites.invitedUserId, req.user!.id),
          eq(schema.senateInvites.status, "pending")
        )
      })
    : null;
  const canViewProfile = Boolean(profile && (profile.userId === req.user!.id || hasSharedConversation(req.user!.id, profile.userId)));
  const canViewSenate = Boolean(senate && (getConversationMember(senate.conversationId, req.user!.id) || pendingInvite));
  if (!canViewProfile && !canViewSenate) {
    res.status(404).end();
    return;
  }

  res.sendFile(path.join(config.uploadDir, file));
});

async function serializeMessage(message: typeof schema.messages.$inferSelect) {
  const sender = await db.query.users.findFirst({ where: eq(schema.users.id, message.senderId) });
  const reads = await db
    .select()
    .from(schema.messageReads)
    .where(eq(schema.messageReads.messageId, message.id));
  const attachments = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.messageId, message.id));

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: sender?.displayName ?? "Senato uyesi",
    body: message.deletedAt ? "" : decryptText(message.encryptedBody),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    readCount: reads.length,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: `/api/attachments/${attachment.id}`,
      previewUrl: isPreviewableMedia(attachment.mimeType)
        ? `/api/attachments/${attachment.id}/preview`
        : undefined
    }))
  };
}

async function serializeConversation(conversationId: string, currentUserId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: eq(schema.conversations.id, conversationId)
  });
  if (!conversation) return null;

  const members = await db
    .select()
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.conversationId, conversationId));
  const users = members.length
    ? await db.select().from(schema.users).where(
        inArray(
          schema.users.id,
          members.map((member) => member.userId)
        )
      )
    : [];
  const profiles = users.length
    ? await db.select().from(schema.profiles).where(inArray(schema.profiles.userId, users.map((user) => user.id)))
    : [];
  const latest = await db.query.messages.findFirst({
    where: eq(schema.messages.conversationId, conversationId),
    orderBy: desc(schema.messages.createdAt)
  });
  const senate = await db.query.senates.findFirst({
    where: eq(schema.senates.conversationId, conversationId)
  });
  const otherUser = users.find((user) => user.id !== currentUserId);
  const title = conversation.type === "dm" ? otherUser?.displayName ?? "Ozel sohbet" : senate?.name ?? conversation.title ?? "Senato";
  const member = members.find((item) => item.userId === currentUserId);

  return {
    id: conversation.id,
    type: conversation.type,
    title,
    senateId: senate?.id ?? null,
    description: senate?.description ?? "",
    photoPath:
      conversation.type === "senate"
        ? senate?.photoPath ?? null
        : profiles.find((profile) => profile.userId === otherUser?.id)?.photoPath ?? null,
    createdById: senate?.createdById ?? null,
    canEdit: senate?.createdById === currentUserId,
    canInvite: Boolean(member?.canInvite),
    members: users.map((user) => ({
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      photoPath: profiles.find((profile) => profile.userId === user.id)?.photoPath ?? null,
      canInvite: Boolean(members.find((item) => item.userId === user.id)?.canInvite)
    })),
    latestMessage: latest ? await serializeMessage(latest) : null
  };
}

async function serializeInvitation(invite: typeof schema.senateInvites.$inferSelect) {
  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.id, invite.senateId) });
  const inviter = await db.query.users.findFirst({ where: eq(schema.users.id, invite.invitedById) });
  if (!senate) return null;
  const members = await db
    .select({ id: schema.conversationMembers.id })
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.conversationId, senate.conversationId));
  return {
    id: invite.id,
    senateId: senate.id,
    name: senate.name,
    description: senate.description,
    photoPath: senate.photoPath,
    invitedByName: inviter?.displayName ?? "Senato uyesi",
    memberCount: members.length,
    createdAt: invite.createdAt.toISOString()
  };
}

async function emitConversation(conversationId: string) {
  const members = await db
    .select()
    .from(schema.conversationMembers)
    .where(eq(schema.conversationMembers.conversationId, conversationId));
  for (const member of members) {
    const payload = await serializeConversation(conversationId, member.userId);
    io.to(`user:${member.userId}`).emit("conversation:updated", payload);
  }
}

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  const { phone, password, displayName } = req.body as {
    phone?: string;
    password?: string;
    displayName?: string;
  };
  const normalizedPhone = phone ? normalizeTurkishMobilePhone(phone) : null;
  const normalizedName = displayName?.trim();
  if (
    !normalizedPhone ||
    !password ||
    !normalizedName ||
    normalizedName.length > 80 ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    res.status(400).json({ error: "Telefon, en fazla 80 karakter ad ve 8-72 bayt arasi sifre gerekli." });
    return;
  }

  const existing = await db.query.users.findFirst({ where: eq(schema.users.phone, normalizedPhone) });
  if (existing) {
    res.status(409).json({ error: "Bu telefon numarasi zaten kayitli." });
    return;
  }

  const userCount = sqlite.prepare("select count(*) as count from users").get() as { count: number };
  const user = {
    id: randomUUID(),
    phone: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 12),
    displayName: normalizedName,
    role: userCount.count === 0 ? ("owner" as const) : ("member" as const),
    createdAt: now()
  };
  await db.insert(schema.users).values(user);
  await db.insert(schema.profiles).values({ userId: user.id, bio: "", updatedAt: now() });
  setAuthCookie(res, signAuthToken({ id: user.id, phone: user.phone, role: user.role }));
  res.status(201).json({
    user: publicUser(
      user,
      { userId: user.id, bio: "", photoPath: null, updatedAt: now() },
      hasAdminAccess(req)
    )
  });
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  const normalizedPhone = phone ? normalizeTurkishMobilePhone(phone) : null;
  const user = normalizedPhone ? await db.query.users.findFirst({ where: eq(schema.users.phone, normalizedPhone) }) : null;
  if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Telefon veya sifre hatali." });
    return;
  }
  const profile = await getProfile(user.id);
  setAuthCookie(res, signAuthToken({ id: user.id, phone: user.phone, role: user.role }));
  res.json({ user: publicUser(user, profile, hasAdminAccess(req)) });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
  if (!user) {
    res.status(401).json({ error: "Kullanici bulunamadi." });
    return;
  }
  res.json({ user: publicUser(user, await getProfile(user.id), hasAdminAccess(req)) });
});

app.patch("/api/me/profile", requireAuth, async (req, res) => {
  const { displayName, bio } = req.body as { displayName?: string; bio?: string };
  const normalizedName = displayName?.trim();
  if (!normalizedName || normalizedName.length > 80 || typeof bio !== "string" || bio.length > 500) {
    res.status(400).json({ error: "Ad gerekli ve biyografi en fazla 500 karakter olabilir." });
    return;
  }
  await db.update(schema.users).set({ displayName: normalizedName }).where(eq(schema.users.id, req.user!.id));
  await db
    .update(schema.profiles)
    .set({ bio, updatedAt: now() })
    .where(eq(schema.profiles.userId, req.user!.id));
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
  res.json({ user: user ? publicUser(user, await getProfile(user.id), hasAdminAccess(req)) : null });
});

app.post("/api/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith("image/")) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: "Foto dosyasi gerekli." });
    return;
  }
  let photoPath: string;
  try {
    photoPath = await saveStandardImage(req.file, config.uploadDir);
  } catch {
    res.status(400).json({ error: "Gecerli bir gorsel dosyasi gerekli." });
    return;
  }
  await db
    .update(schema.profiles)
    .set({ photoPath, updatedAt: now() })
    .where(eq(schema.profiles.userId, req.user!.id));
  res.json({ photoPath });
});

app.get("/api/members", requireAuth, async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (query.length < 2 || query.length > 80 || /[%_\\]/.test(query)) {
    res.json({ members: [] });
    return;
  }
  const users = await db
    .select()
    .from(schema.users)
    .where(
      and(
        ne(schema.users.id, req.user!.id),
        or(like(schema.users.displayName, `%${query}%`), like(schema.users.phone, `%${query}%`))
      )
    )
    .limit(20);
  const profiles = await db.select().from(schema.profiles);
  res.json({
    members: users.map((user) =>
      publicUser(
        user,
        profiles.find((profile) => profile.userId === user.id)
      )
    )
  });
});

app.get("/api/members/:id", requireAuth, async (req, res) => {
  const memberId = paramString(req.params.id);
  if (!memberId || memberId === req.user!.id || !hasSharedConversation(req.user!.id, memberId)) {
    res.status(403).json({ error: "Bu uye profiline erisim yok." });
    return;
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, memberId) });
  if (!user) {
    res.status(404).json({ error: "Uye bulunamadi." });
    return;
  }
  res.json({ member: publicUser(user, await getProfile(user.id)) });
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const memberships = await db
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .innerJoin(
      schema.conversations,
      eq(schema.conversationMembers.conversationId, schema.conversations.id)
    )
    .where(eq(schema.conversationMembers.userId, req.user!.id))
    .orderBy(desc(schema.conversations.lastActivityAt));
  const conversations = (
    await Promise.all(memberships.map((member) => serializeConversation(member.conversationId, req.user!.id)))
  ).filter(Boolean);
  res.json({ conversations });
});

app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const conversationId = paramString(req.params.id);
  if (!getConversationMember(conversationId, req.user!.id)) {
    res.status(403).json({ error: "Bu sohbete erisim yok." });
    return;
  }
  const rawLimit = Number(req.query.limit ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 50) : 30;
  const before = typeof req.query.before === "string" ? req.query.before : "";
  const separator = before.lastIndexOf(":");
  const beforeCreatedAt = separator > 0 ? new Date(before.slice(0, separator)) : null;
  const beforeId = separator > 0 ? before.slice(separator + 1) : "";
  const cursorCondition = beforeCreatedAt && !Number.isNaN(beforeCreatedAt.getTime()) && beforeId
    ? or(
        lt(schema.messages.createdAt, beforeCreatedAt),
        and(eq(schema.messages.createdAt, beforeCreatedAt), lt(schema.messages.id, beforeId))
      )
    : undefined;
  const rows = await db
    .select()
    .from(schema.messages)
    .where(cursorCondition ? and(eq(schema.messages.conversationId, conversationId), cursorCondition) : eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const oldest = page.at(-1);
  res.json({
    messages: await Promise.all(page.reverse().map(serializeMessage)),
    hasMore,
    nextCursor: hasMore && oldest ? `${oldest.createdAt.toISOString()}:${oldest.id}` : null
  });
});

app.post("/api/dm", requireAuth, async (req, res) => {
  const { memberId } = req.body as { memberId?: string };
  if (!memberId || memberId === req.user!.id) {
    res.status(400).json({ error: "Gecerli uye gerekli." });
    return;
  }
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, memberId) });
  if (!target) {
    res.status(404).json({ error: "Uye bulunamadi." });
    return;
  }
  const existing = sqlite
    .prepare(
      `select c.id from conversations c
       join conversation_members a on a.conversation_id = c.id
       join conversation_members b on b.conversation_id = c.id
       where c.type = 'dm' and a.user_id = ? and b.user_id = ?
       limit 1`
    )
    .get(req.user!.id, memberId) as { id: string } | undefined;
  const conversationId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(schema.conversations).values({
      id: conversationId,
      type: "dm",
      title: null,
      createdById: req.user!.id,
      createdAt: now(),
      lastActivityAt: now()
    });
    await db.insert(schema.conversationMembers).values([
      { id: randomUUID(), conversationId, userId: req.user!.id, canInvite: false, joinedAt: now() },
      { id: randomUUID(), conversationId, userId: memberId, canInvite: false, joinedAt: now() }
    ]);
  }
  await emitConversation(conversationId);
  res.status(existing ? 200 : 201).json({ conversation: await serializeConversation(conversationId, req.user!.id) });
});

app.post("/api/senates", requireAuth, upload.single("photo"), async (req, res) => {
  const { name, description = "" } = req.body as { name?: string; description?: string };
  if (!name || name.trim().length < 2 || name.trim().length > 100 || typeof description !== "string") {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: "Senato adi gerekli." });
    return;
  }
  if (req.file && !req.file.mimetype.startsWith("image/")) {
    fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: "Grup fotografi bir gorsel olmali." });
    return;
  }
  const memberIds = [...new Set(parseMemberIds(req.body.memberIds))].filter((id) => id !== req.user!.id);
  const selectedUsers = memberIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, memberIds))
    : [];
  if (selectedUsers.length !== memberIds.length) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: "Secilen uyelerden biri bulunamadi." });
    return;
  }
  const conversationId = randomUUID();
  const senateId = randomUUID();
  let photoPath: string | null = null;
  if (req.file) {
    try {
      photoPath = await saveStandardImage(req.file, config.uploadDir);
    } catch {
      res.status(400).json({ error: "Grup fotografi gecerli bir gorsel olmali." });
      return;
    }
  }
  await db.insert(schema.conversations).values({
    id: conversationId,
    type: "senate",
    title: name.trim(),
    createdById: req.user!.id,
    createdAt: now(),
    lastActivityAt: now()
  });
  await db.insert(schema.senates).values({
    id: senateId,
    conversationId,
    name: name.trim(),
    description: description.trim().slice(0, 500),
    photoPath,
    createdById: req.user!.id,
    createdAt: now()
  });
  await db.insert(schema.conversationMembers).values([
    { id: randomUUID(), conversationId, userId: req.user!.id, canInvite: true, joinedAt: now() }
  ]);
  const invites = selectedUsers.map((member) => ({
    id: randomUUID(),
    senateId,
    invitedUserId: member.id,
    invitedById: req.user!.id,
    status: "pending" as const,
    createdAt: now()
  }));
  if (invites.length) await db.insert(schema.senateInvites).values(invites);
  await emitConversation(conversationId);
  for (const invite of invites) {
    io.to(`user:${invite.invitedUserId}`).emit("senate:invite", await serializeInvitation(invite));
  }
  res.status(201).json({ conversation: await serializeConversation(conversationId, req.user!.id) });
});

app.patch("/api/senates/:id", requireAuth, upload.single("photo"), async (req, res) => {
  const senateId = paramString(req.params.id);
  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.id, senateId) });
  const { name, description = "" } = req.body as { name?: string; description?: string };
  if (!senate || senate.createdById !== req.user!.id || !name?.trim()) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(403).json({ error: "Senato bilgileri guncellenemedi." });
    return;
  }
  if (req.file && !req.file.mimetype.startsWith("image/")) {
    fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: "Grup fotografi bir gorsel olmali." });
    return;
  }
  let photoPath = senate.photoPath;
  if (req.file) {
    try {
      photoPath = await saveStandardImage(req.file, config.uploadDir);
    } catch {
      res.status(400).json({ error: "Grup fotografi gecerli bir gorsel olmali." });
      return;
    }
  }
  await db
    .update(schema.senates)
    .set({ name: name.trim(), description: description.trim().slice(0, 500), photoPath })
    .where(eq(schema.senates.id, senate.id));
  await db.update(schema.conversations).set({ title: name.trim() }).where(eq(schema.conversations.id, senate.conversationId));
  await emitConversation(senate.conversationId);
  res.json({ conversation: await serializeConversation(senate.conversationId, req.user!.id) });
});

app.post("/api/senates/:id/invites", requireAuth, async (req, res) => {
  const senateId = paramString(req.params.id);
  const { memberId } = req.body as { memberId?: string };
  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.id, senateId) });
  if (!senate || !memberId) {
    res.status(404).json({ error: "Senato veya uye bulunamadi." });
    return;
  }
  const inviter = getConversationMember(senate.conversationId, req.user!.id);
  if (!inviter?.canInvite) {
    res.status(403).json({ error: "Davet yetkiniz yok." });
    return;
  }
  const invitedUser = await db.query.users.findFirst({ where: eq(schema.users.id, memberId) });
  if (!invitedUser) {
    res.status(404).json({ error: "Uye bulunamadi." });
    return;
  }
  const existingMember = getConversationMember(senate.conversationId, memberId);
  if (existingMember) {
    res.json({ conversation: await serializeConversation(senate.conversationId, req.user!.id) });
    return;
  }
  const existingInvite = await db.query.senateInvites.findFirst({
    where: and(eq(schema.senateInvites.senateId, senate.id), eq(schema.senateInvites.invitedUserId, memberId))
  });
  if (existingInvite?.status === "blocked") {
    res.status(403).json({ error: "Bu uye bu senatodan davet almak istemiyor." });
    return;
  }
  const invite = existingInvite
    ? { ...existingInvite, invitedById: req.user!.id, status: "pending" as const, createdAt: now() }
    : { id: randomUUID(), senateId: senate.id, invitedUserId: memberId, invitedById: req.user!.id, status: "pending" as const, createdAt: now() };
  if (existingInvite) {
    await db
      .update(schema.senateInvites)
      .set({ invitedById: invite.invitedById, status: invite.status, createdAt: invite.createdAt })
      .where(eq(schema.senateInvites.id, existingInvite.id));
  } else {
    await db.insert(schema.senateInvites).values(invite);
  }
  const payload = await serializeInvitation(invite);
  io.to(`user:${memberId}`).emit("senate:invite", payload);
  res.status(existingInvite ? 200 : 201).json({ invite: payload });
});

app.get("/api/invites", requireAuth, async (req, res) => {
  const invites = await db
    .select()
    .from(schema.senateInvites)
    .where(and(eq(schema.senateInvites.invitedUserId, req.user!.id), eq(schema.senateInvites.status, "pending")))
    .orderBy(desc(schema.senateInvites.createdAt));
  res.json({ invites: (await Promise.all(invites.map(serializeInvitation))).filter(Boolean) });
});

app.post("/api/invites/:id/respond", requireAuth, async (req, res) => {
  const inviteId = paramString(req.params.id);
  const { action } = req.body as { action?: "accept" | "decline" | "block" };
  if (action !== "accept" && action !== "decline" && action !== "block") {
    res.status(400).json({ error: "Davet yaniti gecersiz." });
    return;
  }
  const invite = await db.query.senateInvites.findFirst({
    where: and(
      eq(schema.senateInvites.id, inviteId),
      eq(schema.senateInvites.invitedUserId, req.user!.id),
      eq(schema.senateInvites.status, "pending")
    )
  });
  if (!invite) {
    res.status(404).json({ error: "Bekleyen davet bulunamadi." });
    return;
  }
  if (action === "decline" || action === "block") {
    await db
      .update(schema.senateInvites)
      .set({ status: action === "block" ? "blocked" : "declined" })
      .where(eq(schema.senateInvites.id, invite.id));
    res.json({ status: action === "block" ? "blocked" : "declined" });
    return;
  }

  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.id, invite.senateId) });
  if (!senate) {
    res.status(404).json({ error: "Senato bulunamadi." });
    return;
  }
  db.transaction((tx) => {
    const membership = getConversationMember(senate.conversationId, req.user!.id);
    if (!membership) {
      tx.insert(schema.conversationMembers).values({
        id: randomUUID(),
        conversationId: senate.conversationId,
        userId: req.user!.id,
        canInvite: false,
        joinedAt: now()
      }).run();
    }
    tx.update(schema.senateInvites).set({ status: "accepted" }).where(eq(schema.senateInvites.id, invite.id)).run();
  });
  await emitConversation(senate.conversationId);
  res.json({ conversation: await serializeConversation(senate.conversationId, req.user!.id) });
});

app.post("/api/senates/:id/permissions", requireAuth, async (req, res) => {
  const senateId = paramString(req.params.id);
  const { memberId, canInvite } = req.body as { memberId?: string; canInvite?: boolean };
  const senate = await db.query.senates.findFirst({ where: eq(schema.senates.id, senateId) });
  if (!senate || !memberId) {
    res.status(404).json({ error: "Senato veya uye bulunamadi." });
    return;
  }
  if (senate.createdById !== req.user!.id) {
    res.status(403).json({ error: "Davet yetkisini sadece kurucu degistirebilir." });
    return;
  }
  if (memberId === senate.createdById) {
    res.status(400).json({ error: "Kurucunun davet yetkisi degistirilemez." });
    return;
  }
  if (!getConversationMember(senate.conversationId, memberId)) {
    res.status(404).json({ error: "Uye senatoda bulunamadi." });
    return;
  }
  await db
    .update(schema.conversationMembers)
    .set({ canInvite: Boolean(canInvite) })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, senate.conversationId),
        eq(schema.conversationMembers.userId, memberId)
      )
    );
  await emitConversation(senate.conversationId);
  res.json({ conversation: await serializeConversation(senate.conversationId, req.user!.id) });
});

app.post("/api/messages/:conversationId", requireAuth, async (req, res) => {
  const conversationId = paramString(req.params.conversationId);
  const { body, attachmentIds: rawAttachmentIds = [] } = req.body as { body?: string; attachmentIds?: unknown };
  if (!Array.isArray(rawAttachmentIds) || !rawAttachmentIds.every((id): id is string => typeof id === "string")) {
    res.status(400).json({ error: "Ek listesi gecersiz." });
    return;
  }
  const attachmentIds = [...new Set(rawAttachmentIds)];
  if (typeof body !== "undefined" && typeof body !== "string") {
    res.status(400).json({ error: "Mesaj metni gecersiz." });
    return;
  }
  if (body && body.length > 5_000) {
    res.status(400).json({ error: "Mesaj en fazla 5000 karakter olabilir." });
    return;
  }
  if (!body?.trim() && attachmentIds.length === 0) {
    res.status(400).json({ error: "Mesaj veya ek gerekli." });
    return;
  }
  if (!getConversationMember(conversationId, req.user!.id)) {
    res.status(403).json({ error: "Bu sohbete mesaj gonderemezsiniz." });
    return;
  }
  if (attachmentIds.length > 10) {
    res.status(400).json({ error: "Bir mesaja en fazla 10 ek eklenebilir." });
    return;
  }
  if (attachmentIds.length) {
    const pendingAttachments = await db
      .select({ id: schema.attachments.id })
      .from(schema.attachments)
      .where(
        and(
          inArray(schema.attachments.id, attachmentIds),
          eq(schema.attachments.conversationId, conversationId),
          eq(schema.attachments.uploaderId, req.user!.id),
          isNull(schema.attachments.messageId)
        )
      );
    if (pendingAttachments.length !== attachmentIds.length) {
      res.status(400).json({ error: "Ekler bu sohbete ait degil veya daha once kullanilmis." });
      return;
    }
  }
  const message = {
    id: randomUUID(),
    conversationId,
    senderId: req.user!.id,
    encryptedBody: encryptText(body ?? ""),
    editedAt: null,
    deletedAt: null,
    createdAt: now()
  };
  const read = { id: randomUUID(), messageId: message.id, userId: req.user!.id, readAt: now() };
  db.transaction((tx) => {
    tx.insert(schema.messages).values(message).run();
    if (attachmentIds.length) {
      const update = tx
        .update(schema.attachments)
        .set({ messageId: message.id })
        .where(
          and(
            inArray(schema.attachments.id, attachmentIds),
            eq(schema.attachments.conversationId, conversationId),
            eq(schema.attachments.uploaderId, req.user!.id),
            isNull(schema.attachments.messageId)
          )
        )
        .run();
      if (update.changes !== attachmentIds.length) tx.rollback();
    }
    tx.insert(schema.messageReads).values(read).run();
    tx
      .update(schema.conversations)
      .set({ lastActivityAt: message.createdAt })
      .where(eq(schema.conversations.id, conversationId))
      .run();
  });
  const payload = await serializeMessage(message);
  io.to(`conversation:${message.conversationId}`).emit("message:new", payload);
  await emitConversation(message.conversationId);
  res.status(201).json({ message: payload });
});

app.patch("/api/messages/:id", requireAuth, async (req, res) => {
  const messageId = paramString(req.params.id);
  const { body } = req.body as { body?: string };
  const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!message || message.senderId !== req.user!.id || !body?.trim()) {
    res.status(403).json({ error: "Mesaj duzenlenemedi." });
    return;
  }
  await db
    .update(schema.messages)
    .set({ encryptedBody: encryptText(body), editedAt: now() })
    .where(eq(schema.messages.id, message.id));
  const updated = await db.query.messages.findFirst({ where: eq(schema.messages.id, message.id) });
  const payload = updated ? await serializeMessage(updated) : null;
  io.to(`conversation:${message.conversationId}`).emit("message:edited", payload);
  res.json({ message: payload });
});

app.delete("/api/messages/:id", requireAuth, async (req, res) => {
  const messageId = paramString(req.params.id);
  const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!message || message.senderId !== req.user!.id) {
    res.status(403).json({ error: "Mesaj silinemedi." });
    return;
  }
  await db.update(schema.messages).set({ deletedAt: now() }).where(eq(schema.messages.id, message.id));
  const updated = await db.query.messages.findFirst({ where: eq(schema.messages.id, message.id) });
  const payload = updated ? await serializeMessage(updated) : null;
  io.to(`conversation:${message.conversationId}`).emit("message:deleted", payload);
  res.json({ message: payload });
});

app.post("/api/messages/:id/read", requireAuth, async (req, res) => {
  const messageId = paramString(req.params.id);
  const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, messageId) });
  if (!message || !getConversationMember(message.conversationId, req.user!.id)) {
    res.status(404).json({ error: "Mesaj bulunamadi." });
    return;
  }
  const existing = await db.query.messageReads.findFirst({
    where: and(eq(schema.messageReads.messageId, message.id), eq(schema.messageReads.userId, req.user!.id))
  });
  if (!existing) {
    await db.insert(schema.messageReads).values({
      id: randomUUID(),
      messageId: message.id,
      userId: req.user!.id,
      readAt: now()
    });
  }
  const payload = await serializeMessage(message);
  io.to(`conversation:${message.conversationId}`).emit("message:read", payload);
  res.json({ message: payload });
});

app.post("/api/attachments", requireAuth, upload.single("file"), async (req, res) => {
  const { conversationId } = req.body as { conversationId?: string };
  if (!req.file || !conversationId || !getConversationMember(conversationId, req.user!.id)) {
    res.status(400).json({ error: "Dosya ve sohbet gerekli." });
    return;
  }
  const storedName = safeStoredName(req.file.originalname);
  fs.renameSync(req.file.path, path.join(config.uploadDir, storedName));
  const attachment = {
    id: randomUUID(),
    messageId: null,
    uploaderId: req.user!.id,
    conversationId,
    originalName: req.file.originalname,
    storedName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    createdAt: now()
  };
  await db.insert(schema.attachments).values(attachment);
  res.status(201).json({
    attachment: {
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size
    }
  });
});

app.get("/api/attachments/:id", requireAuth, async (req, res) => {
  const attachmentId = paramString(req.params.id);
  const attachment = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, attachmentId) });
  if (!attachment || !getConversationMember(attachment.conversationId, req.user!.id)) {
    res.status(404).json({ error: "Dosya bulunamadi." });
    return;
  }
  res.download(path.join(config.uploadDir, attachment.storedName), attachment.originalName);
});

app.get("/api/attachments/:id/preview", requireAuth, async (req, res) => {
  const attachmentId = paramString(req.params.id);
  const attachment = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, attachmentId) });
  if (
    !attachment ||
    !getConversationMember(attachment.conversationId, req.user!.id) ||
    !isPreviewableMedia(attachment.mimeType)
  ) {
    res.status(404).json({ error: "Onizleme bulunamadi." });
    return;
  }
  res.set({
    "Content-Type": attachment.mimeType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff"
  });
  res.sendFile(path.join(config.uploadDir, attachment.storedName));
});

app.post("/api/admin/backup", requireAuth, requireLocalAdmin, async (_req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(config.backupDir, stamp);
  try {
    ensureDir(target);
    await sqlite.backup(path.join(target, "senatoroom.sqlite"));
    if (fs.existsSync(config.uploadDir)) {
      fs.cpSync(config.uploadDir, path.join(target, "uploads"), { recursive: true });
    }
    await db.insert(schema.adminBackups).values({
      id: randomUUID(),
      status: "ok",
      path: target,
      error: null,
      createdAt: now()
    });
    res.json({ ok: true, path: target });
  } catch (error) {
    await db.insert(schema.adminBackups).values({
      id: randomUUID(),
      status: "failed",
      path: target,
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
      createdAt: now()
    });
    res.status(500).json({ error: "Yedekleme basarisiz." });
  }
});

const distDir = path.resolve("dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (req, res) => {
    if (req.path === "/api" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
      res.status(404).json({ error: "Kaynak bulunamadi." });
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Dosya boyutu siniri asildi." : "Dosya yuklenemedi.";
    res.status(400).json({ error: message });
    return;
  }
  console.error("Unhandled request error", error);
  res.status(500).json({ error: "Beklenmeyen bir sunucu hatasi olustu." });
});

io.use((socket, next) => {
  const user = readAuthToken(socket.handshake.headers.cookie);
  if (!user) {
    next(new Error("Oturum gerekli."));
    return;
  }
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user as AuthUser;
  socket.join(`user:${user.id}`);

  socket.on("conversation:join", async (conversationId: string) => {
    if (getConversationMember(conversationId, user.id)) {
      socket.join(`conversation:${conversationId}`);
    }
  });

  socket.on("conversation:leave", (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on("typing:start", (conversationId: string) => {
    if (getConversationMember(conversationId, user.id)) {
      socket.to(`conversation:${conversationId}`).emit("typing:start", { conversationId, userId: user.id });
    }
  });

  socket.on("typing:stop", (conversationId: string) => {
    if (getConversationMember(conversationId, user.id)) {
      socket.to(`conversation:${conversationId}`).emit("typing:stop", { conversationId, userId: user.id });
    }
  });
});

void cleanupStalePendingAttachments().catch((error) => console.error("Pending attachment cleanup failed", error));
const cleanupTimer = setInterval(() => {
  void cleanupStalePendingAttachments().catch((error) => console.error("Pending attachment cleanup failed", error));
}, Math.max(config.pendingAttachmentTtlMs, 60 * 60 * 1000));
cleanupTimer.unref();

server.listen(config.port, () => {
  console.log(`SenatoRoom API running on http://localhost:${config.port}`);
});
