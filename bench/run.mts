// Runs the verifier over both planted-failure sets, live, and writes bench/results/bench.json.
// The confidence threshold is chosen on the dev half and reported on the held-out test half.
//   pnpm bench            three repeats          pnpm bench -- 1     one repeat
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCourtListener } from "../src/lib/courtlistener/client";
import { courtListenerResolver } from "../src/lib/courtlistener/resolver";
import { wilson } from "../src/lib/stats/intervals";
import { createJevJudge } from "../src/lib/verify/judge";
import { okfAuthorities } from "../src/lib/verify/okf-authorities";
import { okfRecordStore } from "../src/lib/verify/okf-record";
import type { Check, SentenceStatus } from "../src/lib/verify/types";
import { DEFAULT_OPTIONS, statusOf, verifySentences } from "../src/lib/verify/verify";
import {
  type BenchRow,
  DATASET_VERSION,
  DATASETS,
  type DatasetName,
  loadDataset,
  splitOf,
} from "./dataset";

const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
const repeats = Number(process.argv[2] ?? 3);
const KNOWLEDGE = join(process.cwd(), "knowledge");

type Outcome = {
  id: string;
  class: string;
  expected: BenchRow["expected"];
  split: "dev" | "test";
  status: SentenceStatus;
  checks: Check[];
};

/** A sound sentence is "cleared" when verified or exempt. Anything else is held for a person. */
const cleared = (status: SentenceStatus) => status === "verified" || status === "exempt";

function score(outcomes: Outcome[]) {
  const hold = outcomes.filter((o) => o.expected === "hold");
  const pass = outcomes.filter((o) => o.expected === "pass");
  const missed = hold.filter((o) => cleared(o.status));
  const falseHolds = pass.filter((o) => !cleared(o.status));
  const blocked = hold.filter((o) => o.status === "blocked");
  return {
    // The error that matters: a bad sentence that reached the attorney unflagged.
    missRate: { missed: missed.length, n: hold.length, ...wilson(missed.length, hold.length) },
    // The cost of caution: a sound sentence held back for nothing.
    falseHoldRate: {
      held: falseHolds.length,
      n: pass.length,
      ...wilson(falseHolds.length, pass.length),
    },
    // Of the bad sentences, how many were decided without asking a person.
    autoBlockedShare: {
      blocked: blocked.length,
      n: hold.length,
      ...wilson(blocked.length, hold.length),
    },
    missedIds: missed.map((o) => o.id),
    falseHoldIds: falseHolds.map((o) => o.id),
  };
}

const at = (outcomes: Outcome[], threshold: number) =>
  outcomes.map((o) => ({ ...o, status: statusOf(o.checks, threshold) }));

const record = await okfRecordStore(KNOWLEDGE);
const corpus = await okfAuthorities(KNOWLEDGE);
const resolverFor = () =>
  courtListenerResolver(
    createCourtListener({ token: process.env.COURTLISTENER_TOKEN || undefined }),
    corpus,
  );

const usage = { requests: 0, inputTokens: 0, ms: 0 };
const datasets: Record<string, unknown> = {};
let allDev: Outcome[] = [];
let allTest: Outcome[] = [];

for (const name of DATASETS) {
  const rows = await loadDataset(name);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const runs: Outcome[][] = [];
  for (let i = 0; i < repeats; i++) {
    const judge = createJevJudge();
    const started = Date.now();
    const verifications = await verifySentences(
      rows.map((row) => ({ id: row.id, ...row.sentence })),
      { record, authorities: resolverFor(), judge },
      DEFAULT_OPTIONS,
    );
    usage.ms += Date.now() - started;
    usage.requests += judge.usage.requests;
    usage.inputTokens += judge.usage.inputTokens;
    runs.push(
      verifications.map((v) => {
        const row = byId.get(v.sentenceId) as BenchRow;
        return {
          id: row.id,
          class: row.class,
          expected: row.expected,
          split: splitOf(name as DatasetName, row),
          status: v.status,
          checks: v.checks,
        };
      }),
    );
    console.log(`${name} run ${i + 1}/${repeats}: ${Date.now() - started} ms`);
  }

  const first = runs[0];
  const unstable = rows
    .map((row) => ({
      id: row.id,
      statuses: [...new Set(runs.map((run) => run.find((o) => o.id === row.id)?.status))],
    }))
    .filter((r) => r.statuses.length > 1);
  // A lookup outage sends a citation to review. That is a hold, but not the hold the row tests,
  // so it is counted and shown rather than folded silently into the score.
  const lookupsUnavailable = first
    .filter((o) => o.checks.some((c) => c.reason.startsWith("could not check")))
    .map((o) => o.id);

  const classes = [...new Set(rows.map((r) => r.class))];
  datasets[name] = {
    rows: rows.length,
    courtOrderLabels: rows.filter((r) => r.provenance.startsWith("court-order")).length,
    perClass: classes.map((cls) => {
      const group = first.filter((o) => o.class === cls);
      const count = (status: SentenceStatus) => group.filter((o) => o.status === status).length;
      return {
        class: cls,
        expected: group[0].expected,
        n: group.length,
        cleared: count("verified") + count("exempt"),
        review: count("review"),
        blocked: count("blocked"),
      };
    }),
    all: score(first),
    noise: { unstableRows: unstable.length, of: rows.length, detail: unstable },
    perRun: runs.map((run) => {
      const s = score(run);
      return {
        missed: s.missRate.missed,
        falseHolds: s.falseHoldRate.held,
        autoBlocked: s.autoBlockedShare.blocked,
      };
    }),
    lookupsUnavailable,
    outcomes: first.map((o) => ({
      id: o.id,
      class: o.class,
      expected: o.expected,
      split: o.split,
      status: o.status,
      verdicts: o.checks.map((c) => c.verdict),
      confidences: o.checks.map((c) => c.confidence),
    })),
  };
  allDev = allDev.concat(first.filter((o) => o.split === "dev"));
  allTest = allTest.concat(first.filter((o) => o.split === "test"));
}

// Choose the threshold on dev: fewest misses, then fewest false holds, then the lowest threshold,
// because a lower threshold asks the attorney less often. The test half plays no part in this.
const sweep = (outcomes: Outcome[]) =>
  THRESHOLDS.map((threshold) => {
    const rescored = at(outcomes, threshold);
    const s = score(rescored);
    return {
      threshold,
      missed: s.missRate.missed,
      missRate: s.missRate.rate,
      falseHolds: s.falseHoldRate.held,
      falseHoldRate: s.falseHoldRate.rate,
      decidedWithoutAPerson: rescored.filter((o) => o.status !== "review").length / rescored.length,
    };
  });
const devSweep = sweep(allDev);
const chosen = [...devSweep].sort(
  (a, b) => a.missed - b.missed || a.falseHolds - b.falseHolds || a.threshold - b.threshold,
)[0].threshold;

const result = {
  datasetVersion: DATASET_VERSION,
  generatedAt: new Date().toISOString(),
  commit: execSync("git rev-parse --short HEAD").toString().trim(),
  judgeModel: "typesafe-ai/jev",
  repeats,
  thresholdInUse: DEFAULT_OPTIONS.confidenceThreshold,
  thresholdChosenOnDev: chosen,
  dev: { rows: allDev.length, sweep: devSweep },
  // The headline. These rows took no part in choosing the threshold.
  test: {
    rows: allTest.length,
    atChosen: score(at(allTest, chosen)),
    atInUse: score(at(allTest, DEFAULT_OPTIONS.confidenceThreshold)),
    sweep: sweep(allTest),
  },
  datasets,
  cost: {
    judgeRequests: usage.requests,
    judgeInputTokens: usage.inputTokens,
    usd: usage.inputTokens * 0.042e-6,
    msPerRun: Math.round(usage.ms / repeats),
  },
  limitations: [
    "Most test sentences were written and labelled by the engineer who built the checks. A few sound rows state facts the court itself found; none was adjudicated by a practising attorney.",
    "One real matter, in one court. The planted failures are the failure modes the author thought of.",
    "The held-out half is small, so its ranges are wide. Read the ranges, not the single numbers.",
    "The record is scanned in places; quotes carry the recognition errors of the source text.",
  ],
};

await mkdir(join(process.cwd(), "bench/results"), { recursive: true });
await writeFile(
  join(process.cwd(), "bench/results/bench.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const name of DATASETS) {
  const d = datasets[name] as {
    perClass: unknown[];
    noise: { unstableRows: number; of: number };
    lookupsUnavailable: string[];
  };
  console.log(`\n${name}`);
  console.table(d.perClass);
  console.log(
    `noise ${d.noise.unstableRows}/${d.noise.of} rows changed status across ${repeats} runs; lookups unavailable: ${d.lookupsUnavailable.length}`,
  );
}
console.log("\nthreshold sweep on DEV (used to choose):");
console.table(
  devSweep.map((s) => ({
    ...s,
    missRate: pct(s.missRate),
    falseHoldRate: pct(s.falseHoldRate),
    decidedWithoutAPerson: pct(s.decidedWithoutAPerson),
  })),
);
for (const [label, s] of [
  [`TEST at ${chosen} (chosen on dev)`, result.test.atChosen],
  [`TEST at ${DEFAULT_OPTIONS.confidenceThreshold} (in use)`, result.test.atInUse],
] as const) {
  console.log(`\n${label}`);
  console.log(
    `  missed      ${s.missRate.missed}/${s.missRate.n} = ${pct(s.missRate.rate)} (95% CI ${pct(s.missRate.low)} to ${pct(s.missRate.high)})  ${s.missedIds.join(", ")}`,
  );
  console.log(
    `  false holds ${s.falseHoldRate.held}/${s.falseHoldRate.n} = ${pct(s.falseHoldRate.rate)} (95% CI ${pct(s.falseHoldRate.low)} to ${pct(s.falseHoldRate.high)})  ${s.falseHoldIds.join(", ")}`,
  );
}
console.log(`\ncost $${result.cost.usd.toFixed(4)} for ${repeats} runs of both sets`);
