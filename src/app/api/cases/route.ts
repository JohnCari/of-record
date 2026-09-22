import { randomBytes } from "node:crypto";
import { z } from "zod";
import { MAX_FILES, MAX_TEXT_CHARS } from "@/lib/cases/extract";
import { passagesFromFiling } from "@/lib/courtlistener/filing";
import { getBackend } from "@/lib/drafting/backend";
import { outlineMotion } from "@/lib/drafting/outline";
import { isInvited, NOT_INVITED } from "@/lib/server/invited";
import { api } from "../../../../convex/_generated/api";

export const maxDuration = 120;

const PASSAGES_PER_WRITE = 400;

// The browser reads the files and sends their text (src/lib/cases/extract.ts), so a case of any
// size fits under the request limit and no file is ever stored.
const bodySchema = z.object({
  caption: z.string().trim().min(1).max(200),
  court: z.string().trim().min(1).max(120),
  motion: z.string().trim().min(1).max(400),
  documents: z
    .array(z.object({ title: z.string().trim().min(1).max(120), text: z.string().min(1) }))
    .min(1)
    .max(MAX_FILES),
});

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Attaches a case: the text of the files a person has, what the motion asks for, and nothing else. */
export async function POST(request: Request) {
  if (!(await isInvited())) return NOT_INVITED;
  const backend = getBackend();
  const limit = await backend.convex.mutation(api.limits.takeAttachCase, {
    secret: backend.secret,
  });
  if (!limit.ok) return bad("The demo has reached its daily limit of attached cases.", 429);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return bad("Fill in the case name, the court and the motion, and attach a file.");
  const { caption, court, motion, documents } = parsed.data;
  if (documents.reduce((n, d) => n + d.text.length, 0) > MAX_TEXT_CHARS) {
    return bad("That is more text than one case can hold here.");
  }

  const matterId = `case-${randomBytes(6).toString("hex")}`;
  const { convex, secret } = backend;
  let n = 0;
  for (const doc of documents) {
    n += 1;
    const passages = passagesFromFiling(doc.text);
    if (passages.length === 0) return bad(`${doc.title} has no readable text.`);
    for (let i = 0; i < passages.length; i += PASSAGES_PER_WRITE) {
      await convex.mutation(api.knowledge.upsertSource, {
        secret,
        matterId,
        kind: "record",
        sourceId: `doc-${n}`,
        title: doc.title,
        docKind: "filing",
        notice: "Attached by you. Shown as uploaded.",
        passages: passages.slice(i, i + PASSAGES_PER_WRITE),
        ...(i > 0 ? { append: true } : {}),
      });
    }
  }

  const task = await outlineMotion({
    caption,
    motion,
    excerpts: documents.map((d) => ({ title: d.title, text: d.text.slice(0, 3000) })),
  });
  await convex.mutation(api.matters.upsert, {
    secret,
    matterId,
    caption,
    court,
    motionTitle: "Motion for Summary Judgment",
    motion,
    task,
    prepared: false,
  });
  return Response.json({ matterId });
}
