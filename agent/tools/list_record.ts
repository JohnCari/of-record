import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { getBackend, MATTER_ID } from "../../src/lib/drafting/backend";

export default defineTool({
  description:
    "List every document in the matter record with its docId, title and kind. Call this first.",
  inputSchema: z.object({}),
  label: { start: () => "List the record" },
  async execute() {
    const { convex } = getBackend();
    const sources = await convex.query(api.knowledge.listSources, {
      matterId: MATTER_ID,
      kind: "record",
    });
    return sources.map((source) => ({
      docId: source.sourceId,
      title: source.title,
      kind: source.docKind,
      paragraphs: source.passageCount,
    }));
  },
});
