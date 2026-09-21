import { defineTool } from "eve/tools";
import { z } from "zod";
import { authorityResolver, getBackend } from "../../src/lib/drafting/backend";
import { createJevJudge } from "../../src/lib/verify/judge";
import { caseNameMatch, NAME_MISMATCH } from "../../src/lib/verify/sources";

export default defineTool({
  description:
    "Check that a citation is a real case with the name you expect, and get the paragraphs of the opinion that state the rule you need. Quotes in a law sentence must be copied exactly from the paragraphs this returns.",
  inputSchema: z.object({
    citation: z.string().describe("Reporter citation, e.g. 759 P.2d 1336"),
    caseName: z.string().describe("The case name you expect this citation to be"),
    rule: z
      .string()
      .min(8)
      .describe("The legal rule you want this case to support, in plain words"),
  }),
  label: { start: ({ caseName, citation }) => `Verify ${caseName}, ${citation}` },
  async execute({ citation, caseName, rule }, ctx) {
    const resolver = await authorityResolver(getBackend());
    const result = await resolver.resolve(citation);

    if (result.status === "not_found") {
      return {
        verified: false,
        problem: `No reported case has the citation ${citation}. Do not cite it.`,
      };
    }
    if (result.status === "invalid") return { verified: false, problem: result.message };
    if (result.status === "ambiguous") {
      return {
        verified: false,
        problem: `${citation} matches more than one case: ${result.candidates.join("; ")}.`,
      };
    }
    if (result.status === "unavailable") {
      return { verified: false, problem: `The citation could not be checked: ${result.message}.` };
    }

    const { authority } = result;
    if (caseNameMatch(caseName, authority.caseName) < NAME_MISMATCH) {
      return {
        verified: false,
        problem: `${citation} is ${authority.caseName}, not ${caseName}. Do not cite it under that name.`,
      };
    }

    // An opinion runs to hundreds of paragraphs. Narrow by shared vocabulary, then let the judge
    // say which paragraphs actually state the rule.
    const terms = new Set(rule.toLowerCase().match(/[a-z]{5,}/g) ?? []);
    const candidates = authority.passages
      .map((p) => ({
        p,
        overlap: [...terms].filter((t) => p.text.toLowerCase().includes(t)).length,
      }))
      .filter((c) => c.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 12);

    const scores = await createJevJudge().relevance(
      rule,
      candidates.map(({ p }) => ({ id: String(p.index), text: p.text })),
      ctx.abortSignal,
    );
    const passages = candidates
      .map(({ p }) => ({
        text: p.text,
        statesRule: Number((scores.get(String(p.index)) ?? 0).toFixed(2)),
      }))
      .filter((p) => p.statesRule >= 0.5)
      .sort((a, b) => b.statesRule - a.statesRule)
      .slice(0, 4);

    return {
      verified: true,
      caseName: authority.caseName,
      citation: authority.citation,
      url: authority.url,
      passages,
      note:
        passages.length === 0
          ? "The case is real, but no paragraph of it states that rule. It is not authority for it."
          : "Quote only from these paragraphs.",
    };
  },
});
