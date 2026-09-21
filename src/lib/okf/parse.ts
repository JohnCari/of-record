import { parse as parseYaml } from "yaml";

export type OkfFrontmatter = {
  type: string;
  title?: string;
  description?: string;
  tags?: string[];
  status?: "draft" | "stable" | "deprecated";
  [key: string]: unknown;
};

export type Passage = {
  /** Position in the document, stable for a given file revision. */
  index: number;
  /** Nearest heading above the passage, e.g. "Page 38" or "5. Payment". */
  section: string;
  text: string;
};

export type OkfDocument = {
  path: string;
  frontmatter: OkfFrontmatter;
  title: string;
  /**
   * The leading blockquote banner ("SYNTHETIC DOCUMENT ..."). Shown to people, never sent to a
   * model: it labels fixtures, and a drafter that could read "this is an attack fixture" would
   * make the prompt-injection eval meaningless.
   */
  notice: string | null;
  /** Body with the H1 and the notice removed. This is the only text a model ever sees. */
  text: string;
  passages: Passage[];
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseOkf(raw: string, path: string): OkfDocument {
  const match = raw.match(FRONTMATTER);
  if (!match) throw new Error(`${path}: missing YAML frontmatter`);

  const frontmatter = parseYaml(match[1]) as OkfFrontmatter;
  if (typeof frontmatter?.type !== "string" || frontmatter.type.length === 0) {
    throw new Error(`${path}: OKF requires a string "type" in frontmatter`);
  }

  const blocks = raw
    .slice(match[0].length)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  let title = frontmatter.title ?? path;
  let notice: string | null = null;
  let section = "";
  const passages: Passage[] = [];
  let seenContent = false;

  for (const block of blocks) {
    if (!seenContent && block.startsWith("# ")) {
      title = frontmatter.title ?? block.slice(2).trim();
      continue;
    }
    if (!seenContent && block.startsWith(">")) {
      notice = block.replace(/^>\s?/gm, "").replace(/\s+/g, " ").trim();
      continue;
    }
    seenContent = true;
    if (/^#{1,6}\s/.test(block)) {
      section = block.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    if (/^-{3,}$/.test(block)) continue;
    passages.push({
      index: passages.length,
      section,
      text: block.replace(/\s*\r?\n\s*/g, " "),
    });
  }

  return {
    path,
    frontmatter,
    title,
    notice,
    text: passages.map((passage) => passage.text).join("\n\n"),
    passages,
  };
}
