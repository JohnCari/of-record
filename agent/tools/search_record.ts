import { defineTool } from "eve/tools";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { getBackend, MATTER_ID } from "../../src/lib/drafting/backend";
import { createJevJudge } from "../../src/lib/verify/judge";

export default defineTool({
  description:
    "Search the matter record for paragraphs that establish something. Returns the best paragraphs with their docId, ranked by whether they actually establish it rather than merely mention it.",
  inputSchema: z.object({
    query: z.string().min(3).describe("What you need the record to establish, in plain words"),
  }),
  label: { start: ({ query }) => `Search the record: ${query}` },
  async execute({ query }, ctx) {
    const { convex } = getBackend();
    // Lexical search for recall, then a judge for precision.
    const hits = await convex.query(api.knowledge.search, {
      matterId: MATTER_ID,
      kind: "record",
      text: query,
      limit: 16,
    });
    if (hits.length === 0) return { results: [] };

    const scores = await createJevJudge().relevance(
      query,
      hits.map((hit) => ({
        id: hit._id,
        text: `[${hit.sourceTitle}, ${hit.section}] ${hit.text}`,
      })),
      ctx.abortSignal,
    );
    return {
      results: hits
        .map((hit) => ({
          docId: hit.sourceId,
          title: hit.sourceTitle,
          section: hit.section,
          text: hit.text,
          relevance: Number((scores.get(hit._id) ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 6),
    };
  },
});
