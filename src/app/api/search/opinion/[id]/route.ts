import { opinionPassages } from "@/lib/courtlistener/client";
import { courtListenerFailure, searchAllowed, withCourtListener } from "@/lib/server/courtlistener";

/** The text of one opinion, in passages, for reading in the record pane. */
export async function GET(_request: Request, { params }: RouteContext<"/api/search/opinion/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "No such opinion." }, { status: 404 });
  const refused = await searchAllowed();
  if (refused) return refused;
  try {
    const { text } = await withCourtListener((cl) => cl.opinionText(id), "token-first");
    const passages = opinionPassages(text);
    if (passages.length === 0)
      return Response.json(
        { error: "CourtListener has no readable text for this opinion." },
        { status: 404 },
      );
    return Response.json(
      { passages },
      { headers: { "cache-control": "public, max-age=86400" } }, // opinions do not change
    );
  } catch (error) {
    return courtListenerFailure(error);
  }
}
