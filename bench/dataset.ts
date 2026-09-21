import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DraftSentence } from "../src/lib/verify/types";

export const DATASET_VERSION = "v0.1";

export type BenchRow = {
  id: string;
  class: string;
  /** pass: the sentence is sound and should be cleared. hold: it must not reach filing unflagged. */
  expected: "pass" | "hold";
  sentence: Omit<DraftSentence, "id">;
  construction: string;
};

export async function loadDataset(name: string): Promise<BenchRow[]> {
  const raw = await readFile(
    join(process.cwd(), "bench/dataset", DATASET_VERSION, `${name}.jsonl`),
    "utf8",
  );
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BenchRow);
}
