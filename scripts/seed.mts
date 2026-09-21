// Loads the OKF bundle in knowledge/ into Convex. Idempotent: re-running replaces each source.
//   pnpm seed
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { loadBundle } from "../src/lib/okf/load";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.SERVER_SECRET;
if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and SERVER_SECRET must be set");

const convex = new ConvexHttpClient(url);
const documents = await loadBundle(join(process.cwd(), "knowledge"));
const matter = documents.find((doc) => doc.frontmatter.type === "Matter");
if (!matter) throw new Error("the bundle has no Matter document");
const matterId = String(matter.frontmatter.matter_id);

let records = 0;
let authorities = 0;
for (const doc of documents) {
  const kind =
    doc.frontmatter.type === "Record Document"
      ? ("record" as const)
      : doc.frontmatter.type === "Authority"
        ? ("authority" as const)
        : null;
  if (!kind) continue;

  await convex.mutation(api.knowledge.upsertSource, {
    secret,
    matterId,
    kind,
    sourceId: String(kind === "record" ? doc.frontmatter.doc_id : doc.frontmatter.authority_id),
    title: doc.title,
    docKind: String(doc.frontmatter.doc_kind ?? kind),
    notice: doc.notice,
    citation: doc.frontmatter.citation ? String(doc.frontmatter.citation) : undefined,
    url: doc.frontmatter.resource ? String(doc.frontmatter.resource) : undefined,
    passages: doc.passages,
  });
  if (kind === "record") records += 1;
  else authorities += 1;
}

console.log(`seeded matter "${matterId}": ${records} record documents, ${authorities} authorities`);
