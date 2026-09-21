import { loadBundle } from "../okf/load";
import type { RecordDocument, RecordStore } from "./sources";

/** A record store over an OKF bundle on disk. Used by the bench, the seed script and tests. */
export async function okfRecordStore(
  knowledgeDir: string,
): Promise<RecordStore & { all: RecordDocument[] }> {
  const documents = (await loadBundle(knowledgeDir, "matter"))
    .filter((doc) => doc.frontmatter.type === "Record Document")
    .map((doc) => ({
      id: String(doc.frontmatter.doc_id),
      title: doc.title,
      passages: doc.passages,
    }));
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return { all: documents, get: async (docId) => byId.get(docId) ?? null };
}
