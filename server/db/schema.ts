import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["member", "owner"] }).notNull().default("member"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp" })
  },
  (table) => ({
    phoneIdx: uniqueIndex("users_phone_idx").on(table.phone)
  })
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  photoPath: text("photo_path"),
  bio: text("bio").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme", { enum: ["system", "light", "dark"] }).notNull().default("light"),
  reduceMotion: integer("reduce_motion", { mode: "boolean" }).notNull().default(false),
  readReceipts: integer("read_receipts", { mode: "boolean" }).notNull().default(true),
  showOnlineStatus: integer("show_online_status", { mode: "boolean" }).notNull().default(true),
  soundEnabled: integer("sound_enabled", { mode: "boolean" }).notNull().default(true),
  toastsEnabled: integer("toasts_enabled", { mode: "boolean" }).notNull().default(true),
  badgesEnabled: integer("badges_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["dm", "senate"] }).notNull(),
    title: text("title"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    typeIdx: index("conversations_type_idx").on(table.type),
    activityIdx: index("conversations_last_activity_idx").on(table.lastActivityAt)
  })
);

export const conversationMembers = sqliteTable(
  "conversation_members",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canInvite: integer("can_invite", { mode: "boolean" }).notNull().default(false),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
    leftAt: integer("left_at", { mode: "timestamp" })
  },
  (table) => ({
    uniqueMember: uniqueIndex("conversation_members_unique_idx").on(
      table.conversationId,
      table.userId
    ),
    userIdx: index("conversation_members_user_idx").on(table.userId)
  })
);

export const senates = sqliteTable("senates", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  photoPath: text("photo_path"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const senateInvites = sqliteTable(
  "senate_invites",
  {
    id: text("id").primaryKey(),
    senateId: text("senate_id")
      .notNull()
      .references(() => senates.id, { onDelete: "cascade" }),
    invitedUserId: text("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted", "declined", "blocked"] }).notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    uniqueInvite: uniqueIndex("senate_invites_unique_idx").on(table.senateId, table.invitedUserId),
    userStatusIdx: index("senate_invites_user_status_idx").on(table.invitedUserId, table.status)
  })
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    replyToMessageId: text("reply_to_message_id").references((): any => messages.id, { onDelete: "set null" }),
    encryptedBody: text("encrypted_body").notNull(),
    editedAt: integer("edited_at", { mode: "timestamp" }),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    conversationIdx: index("messages_conversation_idx").on(table.conversationId)
  })
);

export const conversationPreferences = sqliteTable(
  "conversation_preferences",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationLevel: text("notification_level", { enum: ["all", "mentions", "none"] }).notNull().default("all"),
    mutedUntil: integer("muted_until", { mode: "timestamp" }),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    clearedAt: integer("cleared_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    userConversation: uniqueIndex("conversation_preferences_user_conversation_idx").on(table.userId, table.conversationId),
    userArchive: index("conversation_preferences_user_archive_idx").on(table.userId, table.archivedAt)
  })
);

export const conversationReadStates = sqliteTable(
  "conversation_read_states",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: integer("last_read_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    userConversation: uniqueIndex("conversation_read_states_user_conversation_idx").on(table.userId, table.conversationId)
  })
);

export const userBlocks = sqliteTable(
  "user_blocks",
  {
    id: text("id").primaryKey(),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: text("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    uniqueBlock: uniqueIndex("user_blocks_unique_idx").on(table.blockerId, table.blockedUserId),
    blockedUser: index("user_blocks_blocked_user_idx").on(table.blockedUserId)
  })
);

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    uniqueReaction: uniqueIndex("message_reactions_unique_idx").on(table.messageId, table.userId, table.emoji),
    messageIndex: index("message_reactions_message_idx").on(table.messageId)
  })
);

export const messageReads = sqliteTable(
  "message_reads",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp" }).notNull()
  },
  (table) => ({
    uniqueRead: uniqueIndex("message_reads_unique_idx").on(table.messageId, table.userId)
  })
);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const adminBackups = sqliteTable("admin_backups", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["ok", "failed"] }).notNull(),
  path: text("path").notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});

export const userRelations = relations(users, ({ one }) => ({
  profile: one(profiles)
}));
