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
      "---\ntype: Record Document\n---\n\n# Heading\n\n> Public court filing, reproduced\n> as retrieved.\n\n## Page 1\n\n1.1 First\nline wrapped.\n\n1.2 Second.",
      "a.md",
    );
    expect(doc.notice).toBe("Public court filing, reproduced as retrieved.");
    expect(doc.text).not.toMatch(/reproduced/);
    expect(doc.passages).toEqual([
      { index: 0, section: "Page 1", text: "1.1 First line wrapped." },
      { index: 1, section: "Page 1", text: "1.2 Second." },
    ]);
  });

  it("keeps a blockquote that appears after content as a passage", () => {
    const doc = parseOkf("---\ntype: T\n---\n\nFirst.\n\n> quoted later", "a.md");
    expect(doc.notice).toBeNull();
    expect(doc.passages).toHaveLength(2);
  });
});

describe("the knowledge bundle", () => {
  it("contains only material retrieved from CourtListener", async () => {
    const docs = await loadBundle(KNOWLEDGE);
    const sourced = docs.filter((d) =>
      ["Record Document", "Authority", "Matter"].includes(d.frontmatter.type),
    );
    expect(sourced.length).toBeGreaterThan(10);
    for (const doc of sourced) {
      expect(String(doc.frontmatter.resource), doc.path).toMatch(
        /^https:\/\/www\.courtlistener\.com\//,
      );
      expect(JSON.stringify(doc.frontmatter.generated), doc.path).toMatch(/process:fetch-/);
    }
  });

  it("gives every record document a unique id and page-numbered passages", async () => {
    const records = (await loadBundle(KNOWLEDGE, "matter")).filter(
      (doc) => doc.frontmatter.type === "Record Document",
    );
    const ids = records.map((doc) => doc.frontmatter.doc_id);
    expect(records.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ids).size).toBe(ids.length);
    for (const doc of records) {
      expect(doc.passages.length, doc.path).toBeGreaterThan(0);
      for (const passage of doc.passages) expect(passage.section, doc.path).toMatch(/^Page \d+$/);
    }
  });

  it("keeps the court's orders and the parties' briefs out of the record", async () => {
    // They are the answer key the bench is checked against. A drafter that could read the
    // judge's findings would be copying them.
    const records = await loadBundle(KNOWLEDGE, "matter");
    for (const doc of records) {
      expect(String(doc.frontmatter.doc_kind ?? ""), doc.path).not.toMatch(/^(opinion|brief)$/);
      expect(doc.title, doc.path).not.toMatch(/Memorandum and Order|Findings of Fact|Motion for/i);
    }
  });
});
