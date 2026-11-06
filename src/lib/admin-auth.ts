import crypto from "crypto";
import { NextRequest } from "next/server";

export const ALLOWED_ADMIN_EMAILS = [
  "aruanregina@gmail.com",
  "alfian.firja@gmail.com",
];

export const ADMIN_PASSWORD = "LULUSSEMESTERINI";

const SECRET = process.env.ADMIN_SECRET || "financial-assistant-research-admin-secret-2026";
export const ADMIN_COOKIE_NAME = "admin_session";

export interface AdminPayload {
  email: string;
  exp: number;
}

export function validateAdminCredentials(email: string, pass: string): boolean {
  if (!email || !pass) return false;
  const cleanEmail = email.trim().toLowerCase();
  const isAllowedEmail = ALLOWED_ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail);
  return isAllowedEmail && pass === ADMIN_PASSWORD;
}

export function createAdminToken(email: string): string {
  const payload: AdminPayload = {
    email: email.trim().toLowerCase(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days valid
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyAdminToken(token: string | null | undefined): AdminPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8")) as AdminPayload;
    if (Date.now() > payload.exp) return null;
    const isAllowedEmail = ALLOWED_ADMIN_EMAILS.some((e) => e.toLowerCase() === payload.email.toLowerCase());
    if (!isAllowedEmail) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAdminFromRequest(req: NextRequest | Request): AdminPayload | null {
  let cookieHeader: string | null = null;
  if ("cookies" in req && typeof (req as any).cookies?.get === "function") {
    const cookie = (req as any).cookies.get(ADMIN_COOKIE_NAME);
    if (cookie?.value) return verifyAdminToken(cookie.value);
  }
  cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`));
  return match ? verifyAdminToken(decodeURIComponent(match[1])) : null;
}
