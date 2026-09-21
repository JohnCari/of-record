import { defineTool } from "eve/tools";
import { z } from "zod";
import { createCourtListener } from "../../src/lib/courtlistener/client";

// Colorado Supreme Court and Court of Appeals: the courts whose opinions bind a Colorado district court.
const COLORADO = "colo coloctapp";

export default defineTool({
  description:
    "Search real Colorado appellate opinions on CourtListener. Returns case names and reporter citations only. A result is a lead, not authority: call verify_citation before citing it.",
  inputSchema: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        'Search terms. Quote phrases, e.g. "summary judgment" "genuine issue of material fact"',
      ),
  }),
  label: { start: ({ query }) => `Search case law: ${query}` },
  async execute({ query }) {
    const cl = createCourtListener({ token: process.env.COURTLISTENER_TOKEN || undefined });
    const hits = await cl.search(query, { court: COLORADO, limit: 8 });
    return {
      results: hits.map((hit) => ({
        caseName: hit.caseName,
        // The first citation is the official or regional reporter cite.
        citation: hit.citations[0] ?? null,
        court: hit.court,
        dateFiled: hit.dateFiled,
        citedBy: hit.citeCount,
      })),
    };
  },
});
