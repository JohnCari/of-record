import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locateQuote } from "../src/lib/verify/locate";
import { okfRecordStore } from "../src/lib/verify/okf-record";
import { loadDataset } from "./dataset";

// The instrument has to be right before it can say the verifier is wrong. These tests check the
// labels against the record in code, so a typo in a "true" row cannot pose as a verifier miss,
// and a "fabricated" row cannot accidentally be real.
describe("record-faithfulness dataset", async () => {
  const rows = await loadDataset("record-faithfulness");
  const record = await okfRecordStore(join(process.cwd(), "knowledge"));

  it("has unique ids and a construction note on every row", () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const row of rows) expect(row.construction.length, row.id).toBeGreaterThan(10);
  });

  const quoteIsReal = ["supported", "contradicted", "unsupported", "overstated"];
  it.each(rows.filter((r) => quoteIsReal.includes(r.class)))(
    "$id quotes words that are really in the cited document",
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
    "$id quotes words that are not in the cited document",
    async (row) => {
      for (const cite of row.sentence.recordCites) {
        const doc = await record.get(cite.docId);
        expect(doc ? locateQuote(cite.quote, doc.passages).found : false, row.id).toBe(false);
      }
    },
  );

  it("keeps the expected outcome consistent with the class", () => {
    const pass = new Set(["supported", "pure_argument"]);
    for (const row of rows)
      expect(row.expected, row.id).toBe(pass.has(row.class) ? "pass" : "hold");
  });
});
