import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locateQuote } from "../src/lib/verify/locate";
import { okfAuthorities } from "../src/lib/verify/okf-authorities";
import { okfRecordStore } from "../src/lib/verify/okf-record";
import { caseNameMatch } from "../src/lib/verify/sources";
import { DATASETS, loadDataset, splitOf } from "./dataset";

// The instrument has to be right before it can say the verifier is wrong. These tests check the
// labels against the record and the opinions in code, so a typo in a sound row cannot pose as a
// verifier miss, and a planted failure cannot accidentally be real.
const KNOWLEDGE = join(process.cwd(), "knowledge");

describe("record-faithfulness", async () => {
  const rows = await loadDataset("record-faithfulness");
  const record = await okfRecordStore(KNOWLEDGE);

  const quoteIsReal = ["supported", "contradicted", "unsupported", "overstated"];
  it.each(rows.filter((r) => quoteIsReal.includes(r.class)))(
    "$id quotes words that are really in the cited filing",
    async (row) => {
      for (const cite of row.sentence.recordCites) {
        const doc = await record.get(cite.docId);
        expect(doc, `${row.id}: ${cite.docId}`).not.toBeNull();
        expect(
          locateQuote(cite.quote, doc?.passages ?? []).found,
          `${row.id}: "${cite.quote}"`,
        ).toBe(true);
      }
    },
  );

  it.each(rows.filter((r) => r.class === "fabricated_quote" || r.class === "wrong_exhibit"))(
    "$id quotes words that are not in the cited filing",
    async (row) => {
      for (const cite of row.sentence.recordCites) {
        const doc = await record.get(cite.docId);
        expect(doc ? locateQuote(cite.quote, doc.passages).found : false, row.id).toBe(false);
      }
    },
  );
});

describe("citation-integrity", async () => {
  const rows = await loadDataset("citation-integrity");
  const corpus = await okfAuthorities(KNOWLEDGE);
  const byCitation = new Map(corpus.map((a) => [a.citation.toLowerCase(), a]));

  const realCase = ["supported", "misattributed_holding", "wrong_rule"];
  it.each(rows.filter((r) => realCase.includes(r.class)))("$id quotes the case it names", (row) => {
    for (const cite of row.sentence.authorityCites) {
      const authority = byCitation.get(cite.citation.toLowerCase());
      expect(authority, `${row.id}: ${cite.citation} is not in the corpus`).toBeDefined();
      expect(caseNameMatch(cite.caseName, authority?.caseName ?? "")).toBeGreaterThanOrEqual(0.6);
      expect(locateQuote(cite.quote, authority?.passages ?? []).found, `${row.id}: quote`).toBe(
        true,
      );
    }
  });

  it.each(rows.filter((r) => r.class === "mismatched"))(
    "$id names a different case than the citation is",
    (row) => {
      const [cite] = row.sentence.authorityCites;
      const authority = byCitation.get(cite.citation.toLowerCase());
      expect(authority).toBeDefined();
      expect(caseNameMatch(cite.caseName, authority?.caseName ?? "")).toBeLessThan(0.3);
    },
  );

  it.each(rows.filter((r) => r.class === "conflated"))(
    "$id quotes words from a different opinion",
    (row) => {
      const [cite] = row.sentence.authorityCites;
      const authority = byCitation.get(cite.citation.toLowerCase());
      expect(authority).toBeDefined();
      expect(locateQuote(cite.quote, authority?.passages ?? []).found).toBe(false);
      expect(corpus.some((other) => locateQuote(cite.quote, other.passages).found)).toBe(true);
    },
  );

  it.each(rows.filter((r) => r.class === "fictitious"))(
    "$id cites nothing in the corpus",
    (row) => {
      for (const cite of row.sentence.authorityCites)
        expect(byCitation.has(cite.citation.toLowerCase())).toBe(false);
    },
  );
});

describe("every dataset", () => {
  it.each(DATASETS)(
    "%s has unique ids, notes, consistent labels and a usable split",
    async (name) => {
      const rows = await loadDataset(name);
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      const pass = new Set(["supported", "pure_argument"]);
      for (const row of rows) {
        expect(row.construction.length, row.id).toBeGreaterThan(10);
        expect(row.provenance.length, row.id).toBeGreaterThan(0);
        expect(row.expected, row.id).toBe(pass.has(row.class) ? "pass" : "hold");
      }
      // Both halves need sound and planted rows, or a threshold chosen on one says nothing about the other.
      for (const half of ["dev", "test"] as const) {
        const part = rows.filter((row) => splitOf(name, row) === half);
        expect(
          part.some((r) => r.expected === "pass"),
          `${name} ${half}`,
        ).toBe(true);
        expect(
          part.filter((r) => r.expected === "hold").length,
          `${name} ${half}`,
        ).toBeGreaterThanOrEqual(5);
      }
    },
  );
});
