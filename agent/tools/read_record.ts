import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { getBackend, MATTER_ID } from "../../src/lib/drafting/backend";

export default defineTool({
  description:
    "Read one record document in full, paragraph by paragraph. Quotes in a fact sentence must be copied exactly from this text.",
  inputSchema: z.object({ docId: z.string().describe("docId from list_record, e.g. ex-d") }),
  label: { start: ({ docId }) => `Read ${docId}` },
  async execute({ docId }) {
    const { convex } = getBackend();
    const source = await convex.query(api.knowledge.getSource, {
      matterId: MATTER_ID,
      sourceId: docId,
    });
    if (!source || source.kind !== "record") {
      return { found: false as const, message: `The record has no document "${docId}".` };
    }
    return {
      found: true as const,
      docId: source.sourceId,
      title: source.title,
      paragraphs: source.passages.map((p) => ({ section: p.section, text: p.text })),
    };
  },
});
