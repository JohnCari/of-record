import { randomBytes } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { passagesFromFiling } from "@/lib/courtlistener/filing";
import { getBackend } from "@/lib/drafting/backend";
import { outlineMotion } from "@/lib/drafting/outline";
import { isInvited, NOT_INVITED } from "@/lib/server/invited";
import { api } from "../../../../convex/_generated/api";

export const maxDuration = 120;

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const SCAN_THRESHOLD = 200;
const PASSAGES_PER_WRITE = 400;

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Attaches a case: the files a person has, what the motion asks for, and nothing else. */
export async function POST(request: Request) {
  if (!(await isInvited())) return NOT_INVITED;
  const backend = getBackend();
  const limit = await backend.convex.mutation(api.limits.takeAttachCase, {
    secret: backend.secret,
  });
  if (!limit.ok) return bad("The demo has reached its daily limit of attached cases.", 429);

  const form = await request.formData().catch(() => null);
  if (!form) return bad("The form could not be read.");
  const caption = String(form.get("caption") ?? "")
    .trim()
    .slice(0, 200);
  const court = String(form.get("court") ?? "")
    .trim()
    .slice(0, 120);
  const motion = String(form.get("motion") ?? "")
    .trim()
    .slice(0, 400);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!caption || !court || !motion) return bad("Fill in the case name, the court and the motion.");
  if (files.length === 0) return bad("Attach at least one file.");
  if (files.length > MAX_FILES) return bad(`Attach at most ${MAX_FILES} files.`);

  // Read every file before storing anything, so a bad file refuses the whole case cleanly.
  const documents: { title: string; text: string }[] = [];
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return bad(`${file.name} is over 10 MB.`);
    const title = file.name.replace(/\.(pdf|txt)$/i, "").slice(0, 120) || "Filing";
    let text: string;
    if (/\.txt$/i.test(file.name)) {
      text = await file.text();
    } else if (/\.pdf$/i.test(file.name)) {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
        text = (await extractText(pdf, { mergePages: true })).text;
      } catch {
        return bad(`${file.name} could not be read as a PDF.`);
      }
      if (text.replace(/\s+/g, "").length < SCAN_THRESHOLD) {
        return bad(`${file.name} is a scan with no text. Export it with text, or use a .txt.`);
      }
    } else {
      return bad(`${file.name}: only PDF and .txt files are accepted.`);
    }
    total += text.length;
    if (total > MAX_TEXT_CHARS) return bad("That is more text than one case can hold here.");
    documents.push({ title, text });
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
