import { api } from "../../../convex/_generated/api";
import { createCourtListener } from "../courtlistener/client";
import type { Backend } from "./backend";
import { MATTER_ID } from "./sections";

const COLORADO = "colo coloctapp";

export type AuthorityLead = {
  caseName: string;
  citation: string;
  from: "corpus" | "courtlistener";
};

/**
 * Finds cases worth checking for a rule. The seeded corpus is searched first: it is fast, and it
 * keeps the demo working when CourtListener throttles. Live search supplements it and is allowed
 * to fail. Either way a result is only a lead; nothing is citable until verify_citation passes.
 */
export async function findAuthorityLeads(
  { convex }: Backend,
  query: string,
  limit = 8,
): Promise<AuthorityLead[]> {
  const leads: AuthorityLead[] = [];
  const seen = new Set<string>();
  const add = (lead: AuthorityLead) => {
    const key = lead.citation.toLowerCase();
    if (!lead.citation || seen.has(key)) return;
    seen.add(key);
    leads.push(lead);
  };

  // Convex search wants plain terms; quotation marks and operators mean nothing to it.
  const terms = query.replace(/["()]/g, " ").replace(/\s+/g, " ").trim();
  const [passages, sources] = await Promise.all([
    convex.query(api.knowledge.search, {
      matterId: MATTER_ID,
      kind: "authority",
      text: terms,
      limit: 30,
    }),
    convex.query(api.knowledge.listSources, { matterId: MATTER_ID, kind: "authority" }),
  ]);
  const byId = new Map(sources.map((source) => [source.sourceId, source]));
  for (const passage of passages) {
    const source = byId.get(passage.sourceId);
    if (source?.citation)
      add({ caseName: source.title, citation: source.citation, from: "corpus" });
  }

  if (leads.length < limit) {
    const cl = createCourtListener({
      token: process.env.COURTLISTENER_TOKEN || undefined,
      sleep: async () => {},
    });
    const hits = await cl.search(query, { court: COLORADO, limit }).catch(() => []);
    for (const hit of hits) {
      if (hit.citations[0])
        add({ caseName: hit.caseName, citation: hit.citations[0], from: "courtlistener" });
    }
  }
  return leads.slice(0, limit);
}
