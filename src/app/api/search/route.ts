import type { SearchHit } from "@/lib/courtlistener/client";
import {
  courtListenerFailure,
  preferredCitation,
  searchAllowed,
  withCourtListener,
} from "@/lib/server/courtlistener";

const CITATION = /\b\d+\s+[A-Za-z.0-9 ]{1,20}?\s+\d+\b/;

/** Case-law search for the record pane. Words, a case name, or a citation. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 3) return Response.json({ hits: [] });
  const refused = await searchAllowed();
  if (refused) return refused;

  try {
    // Most-cited first: a lawyer typing "Celotex" wants the landmark case, not every case that
    // mentions it. The citation lookup is best effort; the text search alone still finds the case.
    const [hits, looked] = await Promise.all([
      withCourtListener((cl) => cl.search(q, { limit: 10, orderBy: "citeCount desc" })),
      CITATION.test(q)
        ? withCourtListener((cl) => cl.lookup(q), "token-first").catch(() => [])
        : Promise.resolve([]),
    ]);
    // An exact citation match goes first, above anything the text search found.
    const exact: SearchHit[] = looked
      .filter((item) => item.status === 200)
      .flatMap((item) =>
        item.clusters.map((cluster) => ({
          clusterId: cluster.id,
          caseName: cluster.caseName,
          citations: cluster.citations,
          court: "",
          dateFiled: "",
          citeCount: 0,
          url: cluster.url,
          opinionIds: cluster.opinionIds,
        })),
      );
    const seen = new Set(exact.map((hit) => hit.clusterId));
    const merged = [...exact, ...hits.filter((hit) => !seen.has(hit.clusterId))].map((hit) => ({
      ...hit,
      citations: preferredCitation(hit.citations),
    }));
    return Response.json({ hits: merged.slice(0, 10) });
  } catch (error) {
    return courtListenerFailure(error);
  }
}
