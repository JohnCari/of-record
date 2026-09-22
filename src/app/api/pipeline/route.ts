import { after } from "next/server";
import { getBackend, MATTER_ID } from "@/lib/drafting/backend";
import { createPipelineDraft, runPipeline } from "@/lib/pipeline/run";
import { isInvited, NOT_INVITED } from "@/lib/server/invited";
import { api } from "../../../../convex/_generated/api";

// The run takes about two minutes. The response returns the draft id at once and the browser
// follows progress through Convex, so nothing is held open.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await isInvited())) return NOT_INVITED;

  const backend = getBackend();
  const body = (await request.json().catch(() => ({}))) as { matterId?: string };
  const matterId = body.matterId ?? MATTER_ID;
  if (!(await backend.convex.query(api.matters.get, { matterId }))) {
    return Response.json({ error: "Choose a case first." }, { status: 400 });
  }
  const limit = await backend.convex.mutation(api.limits.takePipelineRun, {
    secret: backend.secret,
  });
  if (!limit.ok) {
    return Response.json(
      { error: "The demo has reached its daily limit of live runs. The recorded run still plays." },
      { status: 429 },
    );
  }

  const draftId = await createPipelineDraft(backend, matterId);
  after(() => runPipeline(backend, draftId, { matterId }).catch(() => undefined)); // failure is recorded on the draft
  return Response.json({ draftId });
}
