import { ConvexError } from "convex/values";
import { env } from "./_generated/server";

/**
 * Convex public functions are reachable by anyone who has the deployment URL. Every write in this
 * app therefore takes a secret that only the server (the eve tools and the Next.js route handlers)
 * holds. The browser never writes to Convex directly; it goes through a route that checks the
 * invite cookie first.
 */
export function assertServer(secret: string): void {
  const expected = env.SERVER_SECRET;
  if (!expected || expected.length < 24) {
    throw new ConvexError("SERVER_SECRET is not configured on this deployment");
  }
  if (secret.length !== expected.length) throw new ConvexError("forbidden");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new ConvexError("forbidden");
}
