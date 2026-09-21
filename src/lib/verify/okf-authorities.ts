import { loadBundle } from "../okf/load";
import type { Authority } from "./sources";

/** The opinions in the OKF bundle on disk. Used by the bench and tests, which do not touch Convex. */
export async function okfAuthorities(knowledgeDir: string): Promise<Authority[]> {
  return (await loadBundle(knowledgeDir, "authorities"))
    .filter((doc) => doc.frontmatter.type === "Authority")
    .map((doc) => ({
      id: String(doc.frontmatter.authority_id),
      caseName: doc.title,
      citation: String(doc.frontmatter.citation),
      url: String(doc.frontmatter.resource ?? ""),
      passages: doc.passages,
    }));
}
