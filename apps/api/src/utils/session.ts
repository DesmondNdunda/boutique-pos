import crypto from "crypto";
import { Response } from "express";
import { env } from "../config/env";

const COOKIE_NAME = "bpos_sid";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// We store only the raw session id in the (httpOnly, signed) cookie. The
// actual session record lives in Postgres (Session model) so it can be
// revoked server-side (logout, "log out all devices", password change, etc.)
function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", env.sessionSecret).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signed);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer) ? value : null;
}

export function newSessionId(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export function setSessionCookie(res: Response, sessionId: string) {
  res.cookie(COOKIE_NAME, sign(sessionId), {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    domain: env.cookieDomain || undefined,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/", domain: env.cookieDomain || undefined });
}

export function readSessionId(signedCookieValue: string | undefined): string | null {
  if (!signedCookieValue) return null;
  return unsign(signedCookieValue);
}

export { COOKIE_NAME };
