// The blocking quality gate. Compares the committed bench results with the committed baseline and
// exits non-zero on a regression. It makes no model calls, so it runs in CI without secrets: a
// change to the verifier has to re-run `pnpm bench` and commit the results it produced.
//   pnpm bench:gate            pnpm bench:gate --accept   (after a reviewed improvement)
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATASETS, loadDataset } from "./dataset";

type Rate = { n: number };
type Guarded = {
  datasetVersion: string;
  thresholdInUse: number;
  // The gate guards the held-out half: the half no threshold was chosen on.
  test: {
    rows: number;
    atInUse: { missRate: Rate & { missed: number }; falseHoldRate: Rate & { held: number } };
  };
  datasets: Record<
    string,
    {
      rows: number;
      perRun: { missed: number; falseHolds: number }[];
      lookupsUnavailable: string[];
    }
  >;
};

const path = (file: string) => join(process.cwd(), "bench", file);
const read = async (file: string) => JSON.parse(await readFile(path(file), "utf8")) as Guarded;

const results = await read("results/bench.json");

if (process.argv.includes("--accept")) {
  const { datasetVersion, thresholdInUse, test, datasets } = results;
  const baseline = {
    datasetVersion,
    thresholdInUse,
    test: { rows: test.rows, atInUse: test.atInUse },
    datasets: Object.fromEntries(
      Object.entries(datasets).map(([name, d]) => [
        name,
        { rows: d.rows, perRun: d.perRun, lookupsUnavailable: d.lookupsUnavailable },
      ]),
    ),
    note: "The floor a change must not fall below. Raise it only by committing better results, never by editing this file to make a run pass.",
  };
  await writeFile(path("baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  console.log("Baseline replaced with the committed results.");
  process.exit(0);
}

const baseline = await read("baseline.json");
const failures: string[] = [];

// Results that do not cover the current dataset say nothing about the current code.
for (const name of DATASETS) {
  const rows = await loadDataset(name);
  const covered = results.datasets[name]?.rows ?? 0;
  if (covered !== rows.length) {
    failures.push(`${name}: results cover ${covered} rows of ${rows.length}; re-run pnpm bench`);
  }
  // A fictitious citation only fails if the lookup ran. A run made during an outage proves nothing.
  const unavailable = results.datasets[name]?.lookupsUnavailable.length ?? 0;
  if (unavailable > 0) {
    failures.push(`${name}: ${unavailable} rows ran without a citation lookup; re-run pnpm bench`);
  }
}

// Tolerance comes from measurement, not taste. Jev is not perfectly deterministic: a row whose
// confidence sits on the threshold can flip between runs. The allowance is how much the guarded
// counts moved across the baseline's own identical runs, summed over both sets.
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
const tolerance = (key: "missed" | "falseHolds") =>
  Object.values(baseline.datasets).reduce(
    (sum, d) => sum + spread(d.perRun.map((run) => run[key])),
    0,
  );

const now = results.test.atInUse;
const was = baseline.test.atInUse;
if (now.missRate.missed > was.missRate.missed + tolerance("missed")) {
  failures.push(
    `bad sentences that got through rose from ${was.missRate.missed} to ${now.missRate.missed}`,
  );
}
if (now.falseHoldRate.held > was.falseHoldRate.held + tolerance("falseHolds")) {
  failures.push(
    `sound sentences held back rose from ${was.falseHoldRate.held} to ${now.falseHoldRate.held}`,
  );
}

if (failures.length > 0) {
  console.error("Quality gate: FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `Quality gate: passed on the held-out half. Missed ${now.missRate.missed}/${now.missRate.n} (baseline ${was.missRate.missed}), held ${now.falseHoldRate.held}/${now.falseHoldRate.n} (baseline ${was.falseHoldRate.held}). Allowed run-to-run spread: missed ${tolerance("missed")}, held ${tolerance("falseHolds")}.`,
);
