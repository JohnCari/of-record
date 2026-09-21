import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBackend } from "../../src/lib/drafting/backend";
import { selectFacts } from "../../src/lib/pipeline/select";

export default defineTool({
  description:
    "Have the judge model read every passage of the record and return the ones that establish a point you need, as exact quotations with their docId and page. Prefer this to composing a quote yourself: copy the `quote` field into recordCites unchanged.",
  inputSchema: z.object({
    point: z
      .string()
      .min(12)
      .describe(
        "What the passages must establish, as a full sentence, e.g. 'The passage states which estoppel certificates Alberta delivered, or that one disclosed a problem'",
      ),
  }),
  label: { start: ({ point }) => `Collect facts: ${point}` },
  async execute({ point }, ctx) {
    const facts = await selectFacts(getBackend(), [{ id: "point", label: point, need: point }], {
      perElement: 8,
      signal: ctx.abortSignal,
    });
    return {
      facts: facts.map((f) => ({
        docId: f.docId,
        document: f.docTitle,
        page: f.page,
        quote: f.quote,
        establishes: Number(f.probability.toFixed(2)),
      })),
      note:
        facts.length === 0
          ? "No passage in the record establishes that. Do not write a sentence that needs it."
          : "Each quote is verbatim. Say who a passage is from only if the passage itself shows it: affidavits attach other people's letters and certificates.",
    };
  },
});
