// The blocking quality gate. Compares the committed bench results with the committed baseline and
// exits non-zero on a regression. It makes no model calls, so it runs in CI without secrets: a
// change to the verifier has to re-run `pnpm bench` and commit the results it produced.
//   pnpm bench:gate
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadDataset } from "./dataset";

type Results = {
  dataset: string;
  datasetVersion: string;
  rows: number;
  noise: { unstableRows: number };
  perRun: { missed: number; falseHolds: number }[];
  headline: { missRate: { missed: number; n: number }; falseHoldRate: { held: number; n: number } };
};

const read = async (file: string) =>
  JSON.parse(await readFile(join(process.cwd(), "bench", file), "utf8")) as Results;

const results = await read("results/record-faithfulness.json");
const baseline = await read("baseline.json");
const rows = await loadDataset("record-faithfulness");
const failures: string[] = [];

// Results that do not cover the current dataset say nothing about the current code.
if (results.rows !== rows.length) {
  failures.push(
    `results cover ${results.rows} rows but the dataset has ${rows.length}; re-run pnpm bench`,
  );
}

// Tolerance comes from measurement, not taste. Jev is not perfectly deterministic: rows whose
// confidence sits on the threshold flip between "review" and "blocked" from run to run. Both of
// those hold the sentence, so what matters is how much the guarded counts themselves moved across
// identical baseline runs. That observed spread is the allowance, per metric.
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
const missedTolerance = spread(baseline.perRun.map((run) => run.missed));
const heldTolerance = spread(baseline.perRun.map((run) => run.falseHolds));

const missed = results.headline.missRate.missed;
const allowedMissed = baseline.headline.missRate.missed + missedTolerance;
if (missed > allowedMissed) {
  failures.push(
    `bad sentences that got through rose from ${baseline.headline.missRate.missed} to ${missed}`,
  );
}

const held = results.headline.falseHoldRate.held;
const allowedHeld = baseline.headline.falseHoldRate.held + heldTolerance;
if (held > allowedHeld) {
  failures.push(
    `sound sentences held back rose from ${baseline.headline.falseHoldRate.held} to ${held}`,
  );
}

if (failures.length > 0) {
  console.error("Quality gate: FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `Quality gate: passed. Missed ${missed}/${results.headline.missRate.n} (baseline ${baseline.headline.missRate.missed}), held ${held}/${results.headline.falseHoldRate.n} (baseline ${baseline.headline.falseHoldRate.held}). Observed run-to-run spread: missed ${missedTolerance}, held ${heldTolerance}.`,
);
