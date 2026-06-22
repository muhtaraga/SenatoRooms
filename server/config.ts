import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";

const pendingAttachmentTtlMs = Number(process.env.PENDING_ATTACHMENT_TTL_MS ?? 24 * 60 * 60 * 1000);
const isTest = process.env.NODE_ENV === "test";
const jwtSecret = process.env.JWT_SECRET ?? (isTest ? "test-only-jwt-secret" : "");

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProduction: process.env.NODE_ENV === "production",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "./data/senatoroom.sqlite",
  jwtSecret,
  messageEncryptionKey:
    process.env.MESSAGE_ENCRYPTION_KEY ?? randomBytes(32).toString("base64"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  backupDir: path.resolve(process.env.BACKUP_DIR ?? "./backups"),
  adminPhone: process.env.ADMIN_PHONE ?? "",
  maxUploadBytes: 25 * 1024 * 1024,
  pendingAttachmentTtlMs: Number.isFinite(pendingAttachmentTtlMs) && pendingAttachmentTtlMs > 0
    ? pendingAttachmentTtlMs
    : 24 * 60 * 60 * 1000
};

if (!config.jwtSecret) {
  throw new Error("JWT_SECRET test ortami disinda zorunludur.");
}

if (config.isProduction && !process.env.MESSAGE_ENCRYPTION_KEY) {
  throw new Error("MESSAGE_ENCRYPTION_KEY uretimde zorunludur.");
}

if (!process.env.MESSAGE_ENCRYPTION_KEY) {
  console.warn(
    "MESSAGE_ENCRYPTION_KEY is not set. Dev sessions will use a temporary key and old messages may become unreadable after restart."
  );
}
