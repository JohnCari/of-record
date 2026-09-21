import { defineTool } from "eve/tools";
import { z } from "zod";
import { validateDraft } from "../../src/lib/drafting/backend";
import { currentDraft, logEvent } from "../lib/draft";

export default defineTool({
  description:
    "Verify every sentence of the draft against the record and the cited opinions. Returns the sentences that were blocked or sent to review, each with the reason. Mandatory after any write.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    counts: z.object({
      verified: z.number(),
      blocked: z.number(),
      review: z.number(),
      exempt: z.number(),
    }),
    gateOpen: z.boolean(),
    problems: z.array(
      z.object({
        sentenceId: z.string(),
        status: z.string(),
        text: z.string(),
        reasons: z.array(z.string()),
      }),
    ),
  }),
  label: {
    start: () => "Verify every sentence",
    complete: (_input, output) =>
      `${output.counts.verified} verified, ${output.counts.blocked} blocked, ${output.counts.review} for review`,
  },
  async execute(_input, ctx) {
    const { backend, draftId } = await currentDraft(ctx.session.id);
    const summary = await validateDraft(backend, draftId, ctx.abortSignal);
    await logEvent(
      backend,
      draftId,
      "verify",
      `${summary.counts.verified} verified, ${summary.counts.blocked} blocked, ${summary.counts.review} for review`,
    );
    return {
      counts: summary.counts,
      gateOpen: summary.gate.open,
      problems: summary.problems,
    };
  },
});
