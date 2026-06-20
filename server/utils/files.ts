import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function safeStoredName(originalName: string) {
  const ext = path.extname(originalName).replace(/[^.\w-]/g, "");
  return `${randomUUID()}${ext}`;
}

export async function saveStandardImage(file: Express.Multer.File, uploadDir: string) {
  const storedName = `${randomUUID()}.webp`;
  const target = path.join(uploadDir, storedName);
  try {
    await sharp(file.path).rotate().resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 86 }).toFile(target);
  } finally {
    fs.rmSync(file.path, { force: true });
  }
  return `/uploads/${storedName}`;
}
