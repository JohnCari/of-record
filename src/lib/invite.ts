import { createHmac, timingSafeEqual } from "node:crypto";

export const INVITE_COOKIE = "of_record_invite";
const THIRTY_DAYS = 30 * 24 * 60 * 60;

function sign(expires: number, secret: string): string {
  return createHmac("sha256", secret).update(`invited:${expires}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The code in the invite link. Derived from the secret so there is one value to manage. */
export function inviteCode(secret: string): string {
  return createHmac("sha256", secret).update("invite-link").digest("hex").slice(0, 24);
}

export function isInviteCode(candidate: string, secret: string): boolean {
  return safeEqual(candidate, inviteCode(secret));
}

export function mintInviteCookie(
  secret: string,
  now = Date.now(),
): { value: string; maxAge: number } {
  const expires = Math.floor(now / 1000) + THIRTY_DAYS;
  return { value: `${expires}.${sign(expires, secret)}`, maxAge: THIRTY_DAYS };
}

export function isValidInviteCookie(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const [rawExpires, signature] = value.split(".");
  const expires = Number(rawExpires);
  if (!Number.isInteger(expires) || !signature) return false;
  if (expires * 1000 < now) return false;
  return safeEqual(signature, sign(expires, secret));
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
