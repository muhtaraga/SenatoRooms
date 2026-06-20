import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config";

const key = createHash("sha256").update(config.messageEncryptionKey).digest();

export function encryptText(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptText(payload: string) {
  try {
    const parts = payload.split(".");
    if (parts.length !== 3) return "";
    const [ivRaw, tagRaw, encryptedRaw] = parts;
    if (!ivRaw || !tagRaw || !encryptedRaw) return "";
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}
