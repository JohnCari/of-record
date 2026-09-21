import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

/** What is actually in the database for a session, which is what the guarantees are about. */
export async function storedDraft(sessionId: string) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL must be set to run the evals");
  const convex = new ConvexHttpClient(url);
  const draftId = await convex.query(api.drafts.bySession, { sessionId });
  return draftId ? await convex.query(api.drafts.get, { draftId }) : null;
}

export const cleared = (status: string | undefined) => status === "verified" || status === "exempt";
