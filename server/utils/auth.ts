import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { sqlite } from "../db";

export type AuthUser = {
  id: string;
  phone: string;
  role: "member" | "owner";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signAuthToken(user: AuthUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "7d" });
}

export function readAuthToken(rawCookie = "") {
  const token = rawCookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sr_session="))
    ?.split("=")[1];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret) as AuthUser;
  } catch {
    return null;
  }
}

export function getActiveAuthUser(rawCookie = "") {
  const user = readAuthToken(rawCookie);
  const activeUser = user
    ? sqlite.prepare("select 1 from users where id = ? and deleted_at is null limit 1").get(user.id)
    : null;
  return user && activeUser ? user : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getActiveAuthUser(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Oturum gerekli." });
    return;
  }
  req.user = user;
  next();
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("sr_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie("sr_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction
  });
}
