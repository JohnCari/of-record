import type { Authority, AuthorityResolver, ResolvedCitation } from "../verify/sources";
import { type CourtListener, CourtListenerError, opinionPassages } from "./client";

const key = (citation: string) => citation.replace(/\s+/g, " ").trim().toLowerCase();

// Prefer the opinion of the court over concurrences and dissents: a rule quoted from a dissent is
// a misattributed holding, and the judge should never be handed one as if it were the law.
const OPINION_RANK = ["lead-opinion", "majority-opinion", "combined-opinion", "unanimous-opinion"];

/**
 * Resolves a citation against the seeded corpus first, then CourtListener. The corpus makes the
 * demo fast and keeps it working under CourtListener's rate limit; the live lookup is what catches
 * a citation to a case that does not exist.
 */
export function courtListenerResolver(
  cl: CourtListener,
  corpus: Authority[] = [],
): AuthorityResolver {
  const known = new Map<string, Authority>();
  for (const authority of corpus) known.set(key(authority.citation), authority);

  return {
    async resolve(citation): Promise<ResolvedCitation> {
      const cached = known.get(key(citation));
      if (cached) return { status: "found", authority: cached };

      try {
        const [result] = await cl.lookup(citation);
        if (!result)
          return {
            status: "invalid",
            message: `"${citation}" is not a recognisable reporter citation`,
          };
        if (result.status === 404) return { status: "not_found" };
        if (result.status === 400)
          return { status: "invalid", message: result.message || "invalid reporter" };
        if (result.status === 300 || result.clusters.length > 1) {
          return {
            status: "ambiguous",
            candidates: result.clusters.map((cluster) => cluster.caseName),
          };
        }
        if (result.status !== 200 || result.clusters.length === 0) {
          return {
            status: "unavailable",
            message: `CourtListener returned status ${result.status}`,
          };
        }

        const [cluster] = result.clusters;
        const opinions = await Promise.all(cluster.opinionIds.map((id) => cl.opinionText(id)));
        const ranked = opinions
          .filter((opinion) => opinion.text.length > 0)
          .sort((a, b) => rank(a.type) - rank(b.type));
        if (ranked.length === 0) {
          return {
            status: "unavailable",
            message: `no opinion text is available for ${cluster.caseName}`,
          };
        }

        const authority: Authority = {
          id: `cl-${cluster.id}`,
          caseName: cluster.caseName,
          citation: result.normalized[0] ?? citation,
          url: cluster.url,
          passages: opinionPassages(ranked[0].text),
        };
        known.set(key(citation), authority);
        return { status: "found", authority };
      } catch (error) {
        const message =
          error instanceof CourtListenerError ? error.message : "CourtListener request failed";
        return { status: "unavailable", message };
      }
    },
  };
}

function rank(type: string): number {
  const at = OPINION_RANK.findIndex((name) => type.includes(name));
  return at === -1 ? OPINION_RANK.length : at;
}
