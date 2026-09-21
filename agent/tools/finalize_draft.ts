import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { validateDraft } from "../../src/lib/drafting/backend";
import { currentDraft, logEvent } from "../lib/draft";

/**
 * Two locks, and the agent holds neither key.
 *
 * The approval policy runs before the tool does. It re-verifies the whole draft and denies the
 * call outright while any sentence is blocked, in review, or unverified, so the attorney is never
 * asked to approve something the verifier has not cleared. Only then does a person get asked.
 *
 * Signing then re-checks the gate inside the Convex transaction, against what is stored at that
 * instant, in case anything changed while the approval was pending.
 */
export default defineTool({
  description:
    "Submit the draft for the attorney's sign-off. Refused while any sentence is blocked, in review, or unverified. If it is not refused, the attorney must still approve it.",
  inputSchema: z.object({}),
  label: { start: () => "Submit for attorney sign-off" },
  approval: async ({ session }) => {
    const { backend, draftId } = await currentDraft(session.id);
    const summary = await validateDraft(backend, draftId);
    if (summary.gate.open) return "user-approval";

    const open = summary.gate.blocking.map((b) => `${b.sentenceId} (${b.status})`).join(", ");
    await logEvent(backend, draftId, "gate", "Gate refused sign-off", open);
    return { type: "denied", reason: `The gate is closed. Still open: ${open}.` };
  },
  async execute(_input, ctx) {
    const { backend, draftId } = await currentDraft(ctx.session.id);
    const result = await backend.convex.mutation(api.drafts.sign, {
      secret: backend.secret,
      draftId,
      by: ctx.session.auth.current?.principalId ?? "attorney",
    });
    if (!result.signed) {
      await logEvent(backend, draftId, "gate", "Gate refused sign-off", result.open.join(", "));
      return { signed: false, stillOpen: result.open };
    }
    await logEvent(backend, draftId, "sign", "Attorney signed the draft");
    return { signed: true };
  },
});
