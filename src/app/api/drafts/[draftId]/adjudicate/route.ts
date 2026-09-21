import { z } from "zod";
import { getBackend } from "@/lib/drafting/backend";
import { isInvited, NOT_INVITED } from "@/lib/server/invited";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const body = z.object({
  sentenceId: z.string().min(1),
  decision: z.enum(["accept", "strike"]),
  reason: z
    .string()
    .trim()
    .min(3, "Say why, in a few words. The reason becomes a test-set label.")
    .max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  if (!(await isInvited())) return NOT_INVITED;
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { draftId } = await params;
  const { convex, secret } = getBackend();
  await convex.mutation(api.drafts.adjudicate, {
    secret,
    draftId: draftId as Id<"drafts">,
    by: "invited-attorney",
    ...parsed.data,
  });
  return Response.json({ ok: true });
}
