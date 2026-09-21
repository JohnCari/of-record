import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBackend } from "../../src/lib/drafting/backend";
import { findAuthorityLeads } from "../../src/lib/drafting/research";

export default defineTool({
  description:
    "Search real Colorado appellate opinions. Returns case names and reporter citations only. A result is a lead, not authority: call verify_citation before citing it.",
  inputSchema: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        "What rule you need authority for, in plain words, e.g. summary judgment genuine issue of material fact",
      ),
  }),
  label: { start: ({ query }) => `Search case law: ${query}` },
  async execute({ query }) {
    const leads = await findAuthorityLeads(getBackend(), query);
    return { results: leads.map(({ caseName, citation }) => ({ caseName, citation })) };
  },
});
