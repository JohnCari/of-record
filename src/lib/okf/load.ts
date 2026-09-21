import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { type OkfDocument, parseOkf } from "./parse";

// OKF reserves these names for directory listings and update history.
const RESERVED = new Set(["index.md", "log.md"]);

export async function loadBundle(root: string, subdir = ""): Promise<OkfDocument[]> {
  const dir = join(root, subdir);
  const entries = await readdir(dir, { withFileTypes: true });
  const documents: OkfDocument[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      documents.push(...(await loadBundle(root, relative(root, full))));
    } else if (entry.name.endsWith(".md") && !RESERVED.has(entry.name)) {
      documents.push(parseOkf(await readFile(full, "utf8"), relative(root, full)));
    }
  }
  return documents;
}
