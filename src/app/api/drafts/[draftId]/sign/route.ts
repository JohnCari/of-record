import { getBackend } from "@/lib/drafting/backend";
import { isInvited, NOT_INVITED } from "@/lib/server/invited";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  if (!(await isInvited())) return NOT_INVITED;
  const { draftId } = await params;
  const { convex, secret } = getBackend();
  // The mutation re-checks the gate against stored state. A closed gate is a normal answer here.
  const result = await convex.mutation(api.drafts.sign, {
    secret,
    draftId: draftId as Id<"drafts">,
    by: "invited-attorney",
  });
  return Response.json(result, { status: result.signed ? 200 : 409 });
}
