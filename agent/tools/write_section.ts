import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { SECTIONS } from "../../src/lib/drafting/backend";
import { draftSentenceSchema } from "../../src/lib/verify/types";
import { countWrite, currentDraft, logEvent, MAX_WRITES_PER_SECTION } from "../lib/draft";

const sectionIds = SECTIONS.map((section) => section.id) as [string, ...string[]];

export default defineTool({
  description:
    "Write or replace one section of the draft. Replacing a section discards its previous sentences and their verification, so call validate_draft afterwards.",
  inputSchema: z.object({
    sectionId: z.enum(sectionIds),
    sentences: z.array(draftSentenceSchema).min(1).max(40),
  }),
  label: {
    start: ({ sectionId, sentences }) => `Write ${sectionId} (${sentences.length} sentences)`,
  },
  async execute({ sectionId, sentences }, ctx) {
    // An agent that keeps rewriting until the verifier relents is optimising against the gate.
    // After a fixed number of attempts the remaining open sentences belong to the attorney.
    const budget = countWrite(sectionId);
    if (!budget.allowed) {
      return {
        refused: true,
        message: `You have already written "${sectionId}" ${MAX_WRITES_PER_SECTION} times. Do not rewrite it again. Leave the sentences that are still open for the attorney and report what is waiting for them.`,
      };
    }

    const { backend, draftId } = await currentDraft(ctx.session.id);
    const sentenceIds = await backend.convex.mutation(api.drafts.writeSection, {
      secret: backend.secret,
      draftId,
      sectionId,
      sectionOrder: SECTIONS.findIndex((section) => section.id === sectionId),
      sentences,
    });
    await logEvent(
      backend,
      draftId,
      "write",
      `Wrote ${sectionId}`,
      `${sentences.length} sentences`,
    );
    const left = MAX_WRITES_PER_SECTION - budget.used;
    return {
      sentenceIds,
      next: `Call validate_draft. You may rewrite this section ${left} more time${left === 1 ? "" : "s"}.`,
    };
  },
});
