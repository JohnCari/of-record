import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { SECTIONS } from "../../src/lib/drafting/backend";
import { draftSentenceSchema } from "../../src/lib/verify/types";
import { currentDraft, logEvent } from "../lib/draft";

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
    return { sentenceIds, next: "Call validate_draft." };
  },
});
