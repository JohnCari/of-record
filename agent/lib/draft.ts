import { defineState } from "eve/context";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type Backend, getBackend, MATTER_ID } from "../../src/lib/drafting/backend";

// One draft per session, remembered durably so a resumed session keeps writing the same draft.
const draftState = defineState("of-record.draft", () => ({ draftId: null as string | null }));

export async function currentDraft(
  sessionId: string,
): Promise<{ backend: Backend; draftId: Id<"drafts"> }> {
  const backend = getBackend();
  const known = draftState.get().draftId;
  if (known) return { backend, draftId: known as Id<"drafts"> };

  const draftId = await backend.convex.mutation(api.drafts.create, {
    secret: backend.secret,
    matterId: MATTER_ID,
    lane: "agentic",
    sessionId,
  });
  draftState.update(() => ({ draftId }));
  return { backend, draftId };
}

export async function logEvent(
  backend: Backend,
  draftId: Id<"drafts">,
  type: string,
  label: string,
  detail?: string,
): Promise<void> {
  await backend.convex.mutation(api.drafts.logEvent, {
    secret: backend.secret,
    draftId,
    type,
    label,
    detail,
  });
}

/** How many times each section may be written in one session. Loop control lives in code. */
export const MAX_WRITES_PER_SECTION = 3;

const writeCounts = defineState("of-record.writes", () => ({}) as Record<string, number>);

/** Counts a write and says whether it is allowed. */
export function countWrite(sectionId: string): { allowed: boolean; used: number } {
  const used = (writeCounts.get()[sectionId] ?? 0) + 1;
  if (used > MAX_WRITES_PER_SECTION) return { allowed: false, used: used - 1 };
  writeCounts.update((counts) => ({ ...counts, [sectionId]: used }));
  return { allowed: true, used };
}
