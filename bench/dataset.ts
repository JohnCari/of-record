import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DraftSentence } from "../src/lib/verify/types";

export const DATASET_VERSION = "v0.2";
export const DATASETS = ["record-faithfulness", "citation-integrity"] as const;
export type DatasetName = (typeof DATASETS)[number];

export type BenchRow = {
  id: string;
  class: string;
  /** pass: the sentence is sound and should be cleared. hold: it must not reach filing unflagged. */
  expected: "pass" | "hold";
  sentence: Omit<DraftSentence, "id">;
  construction: string;
  /** Who says the label is right: the engineer, or a finding in the court's own order. */
  provenance: string;
};

export async function loadDataset(name: DatasetName): Promise<BenchRow[]> {
  const raw = await readFile(
    join(process.cwd(), "bench/dataset", DATASET_VERSION, `${name}.jsonl`),
    "utf8",
  );
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BenchRow);
}

/**
 * A fixed half of the rows is held out. Anything chosen by looking at results, the confidence
 * threshold above all, is chosen on dev and reported on test. The split depends only on the row's
 * id, so adding rows never moves an existing row across it.
 */
export function splitOf(dataset: DatasetName, row: BenchRow): "dev" | "test" {
  return createHash("sha1").update(`${dataset}/${row.id}`).digest()[0] % 2 === 0 ? "dev" : "test";
}
