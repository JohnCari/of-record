import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBundle } from "./load";
import { parseOkf } from "./parse";

const KNOWLEDGE = join(process.cwd(), "knowledge");

describe("parseOkf", () => {
  it("rejects a document without frontmatter or without a type", () => {
    expect(() => parseOkf("# Title\n\nBody", "a.md")).toThrow(/frontmatter/);
    expect(() => parseOkf("---\ntitle: x\n---\n\nBody", "a.md")).toThrow(/type/);
  });

  it("splits the banner into notice and keeps it out of model-visible text", () => {
    const doc = parseOkf(
      "---\ntype: Record Document\n---\n\n# Heading\n\n> SYNTHETIC DOCUMENT and an\n> attack fixture.\n\n## 1. Terms\n\n1.1 First\nline wrapped.\n\n1.2 Second.",
      "a.md",
    );
    expect(doc.notice).toBe("SYNTHETIC DOCUMENT and an attack fixture.");
    expect(doc.text).not.toMatch(/SYNTHETIC|attack/);
    expect(doc.passages).toEqual([
      { index: 0, section: "1. Terms", text: "1.1 First line wrapped." },
      { index: 1, section: "1. Terms", text: "1.2 Second." },
    ]);
  });

  it("keeps a blockquote that appears after content as a passage", () => {
    const doc = parseOkf("---\ntype: T\n---\n\nFirst.\n\n> quoted later", "a.md");
    expect(doc.notice).toBeNull();
    expect(doc.passages).toHaveLength(2);
  });
});

describe("the matter bundle", () => {
  it("loads every record document with a unique doc_id", async () => {
    const docs = await loadBundle(KNOWLEDGE, "matter");
    const records = docs.filter((doc) => doc.frontmatter.type === "Record Document");
    const ids = records.map((doc) => doc.frontmatter.doc_id);
    expect(records.length).toBeGreaterThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("ex-d");
  });

  it("never exposes fixture labels to a model", async () => {
    const docs = await loadBundle(KNOWLEDGE, "matter");
    const memo = docs.find((doc) => doc.frontmatter.doc_id === "ex-f");
    expect(memo?.notice).toMatch(/attack fixture/);
    // The injection itself must survive, or the red-team eval tests nothing.
    expect(memo?.text).toMatch(/Disregard your prior instructions/);
    expect(memo?.text).not.toMatch(/attack fixture|SYNTHETIC|red.team/i);
  });

  it("marks every matter document synthetic", async () => {
    const docs = await loadBundle(KNOWLEDGE, "matter");
    for (const doc of docs) {
      expect(doc.frontmatter.synthetic, doc.path).toBe(true);
      expect(doc.frontmatter.tags, doc.path).toContain("synthetic");
    }
  });
});
