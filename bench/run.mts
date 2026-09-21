// Runs the verifier over the planted-failure set, live against Jev, and writes the results.
//   pnpm bench            three repeats
//   pnpm bench -- 1       one repeat
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ruleOfThree, wilson } from "../src/lib/stats/intervals";
import { createJevJudge } from "../src/lib/verify/judge";
import { okfRecordStore } from "../src/lib/verify/okf-record";
import type { Check, SentenceStatus } from "../src/lib/verify/types";
import { DEFAULT_OPTIONS, statusOf, verifySentences } from "../src/lib/verify/verify";
import { type BenchRow, DATASET_VERSION, loadDataset } from "./dataset";

const DATASET = "record-faithfulness";
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
const repeats = Number(process.argv[2] ?? 3);

type Outcome = {
  id: string;
  class: string;
  expected: BenchRow["expected"];
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

const rows = await loadDataset(DATASET);
const record = await okfRecordStore(join(process.cwd(), "knowledge"));
const sentences = rows.map((row) => ({ id: row.id, ...row.sentence }));
const byId = new Map(rows.map((row) => [row.id, row]));

const runs: Outcome[][] = [];
const usage = { requests: 0, inputTokens: 0, outputTokens: 0, ms: 0 };

for (let i = 0; i < repeats; i++) {
  const judge = createJevJudge();
  const started = Date.now();
  const verifications = await verifySentences(
    sentences,
    { record, authorities: { resolve: async () => ({ status: "not_found" }) }, judge },
    DEFAULT_OPTIONS,
  );
  usage.ms += Date.now() - started;
  usage.requests += judge.usage.requests;
  usage.inputTokens += judge.usage.inputTokens;
  usage.outputTokens += judge.usage.outputTokens;
  runs.push(
    verifications.map((v) => {
      const row = byId.get(v.sentenceId) as BenchRow;
      return {
        id: row.id,
        class: row.class,
        expected: row.expected,
        status: v.status,
        checks: v.checks,
      };
    }),
  );
  console.log(`run ${i + 1}/${repeats}: ${Date.now() - started} ms`);
}

// Noise: rows whose status differed between repeats of the identical input.
const unstable = rows
  .map((row) => ({
    id: row.id,
    statuses: [...new Set(runs.map((run) => run.find((o) => o.id === row.id)?.status))],
  }))
  .filter((r) => r.statuses.length > 1);

const first = runs[0];
const classes = [...new Set(rows.map((r) => r.class))];
const perClass = classes.map((cls) => {
  const group = first.filter((o) => o.class === cls);
  const count = (status: SentenceStatus) => group.filter((o) => o.status === status).length;
  return {
    class: cls,
    expected: group[0].expected,
    n: group.length,
    verified: count("verified"),
    exempt: count("exempt"),
    review: count("review"),
    blocked: count("blocked"),
  };
});

// The threshold only changes how a stored judgment is routed, so the sweep needs no new calls.
const sweep = THRESHOLDS.map((threshold) => {
  const rescored = first.map((o) => ({ ...o, status: statusOf(o.checks, threshold) }));
  const s = score(rescored);
  const decidedAlone = rescored.filter((o) => o.status !== "review").length / rescored.length;
  return {
    threshold,
    missRate: s.missRate.rate,
    missed: s.missRate.missed,
    falseHoldRate: s.falseHoldRate.rate,
    falseHolds: s.falseHoldRate.held,
    decidedWithoutAPerson: decidedAlone,
  };
});

const headline = score(first);
const result = {
  dataset: DATASET,
  datasetVersion: DATASET_VERSION,
  rows: rows.length,
  generatedAt: new Date().toISOString(),
  commit: execSync("git rev-parse --short HEAD").toString().trim(),
  judgeModel: "typesafe-ai/jev",
  confidenceThreshold: DEFAULT_OPTIONS.confidenceThreshold,
  repeats,
  headline,
  // With zero misses the honest statement is the upper bound, not "0%".
  missRateUpperBoundIfZero: ruleOfThree(headline.missRate.n),
  perClass,
  sweep,
  noise: { unstableRows: unstable.length, of: rows.length, detail: unstable },
  perRun: runs.map((run) => {
    const s = score(run);
    return {
      missed: s.missRate.missed,
      falseHolds: s.falseHoldRate.held,
      autoBlocked: s.autoBlockedShare.blocked,
    };
  }),
  cost: {
    judgeRequests: usage.requests,
    judgeInputTokens: usage.inputTokens,
    usd: usage.inputTokens * 0.042e-6,
    msPerRun: Math.round(usage.ms / repeats),
  },
  outcomes: first.map((o) => ({
    id: o.id,
    class: o.class,
    expected: o.expected,
    status: o.status,
    verdicts: o.checks.map((c) => c.verdict),
    confidences: o.checks.map((c) => c.confidence),
  })),
  limitations: [
    "Rows were written by the engineer who built the verifier, not adjudicated by an attorney.",
    "One synthetic matter in one jurisdiction; the record is short and clean compared with a real file.",
    "Failures were planted by hand, so they reflect the failure modes the author thought of.",
    `${rows.length} rows cannot distinguish small differences in rate; read the intervals, not the point estimates.`,
  ],
};

await mkdir(join(process.cwd(), "bench/results"), { recursive: true });
await writeFile(
  join(process.cwd(), "bench/results", `${DATASET}.json`),
  `${JSON.stringify(result, null, 2)}\n`,
);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(
  `\n${DATASET} ${DATASET_VERSION}, ${rows.length} rows, threshold ${DEFAULT_OPTIONS.confidenceThreshold}`,
);
console.table(perClass);
console.log(
  `miss rate        ${headline.missRate.missed}/${headline.missRate.n} = ${pct(headline.missRate.rate)}  (95% CI ${pct(headline.missRate.low)} to ${pct(headline.missRate.high)})  ${headline.missedIds.join(", ")}`,
);
console.log(
  `false-hold rate  ${headline.falseHoldRate.held}/${headline.falseHoldRate.n} = ${pct(headline.falseHoldRate.rate)}  (95% CI ${pct(headline.falseHoldRate.low)} to ${pct(headline.falseHoldRate.high)})  ${headline.falseHoldIds.join(", ")}`,
);
console.log(
  `auto-blocked     ${headline.autoBlockedShare.blocked}/${headline.autoBlockedShare.n} of bad sentences needed no person`,
);
console.log(
  `noise            ${unstable.length}/${rows.length} rows changed status across ${repeats} identical runs`,
);
console.table(
  sweep.map((s) => ({
    ...s,
    missRate: pct(s.missRate),
    falseHoldRate: pct(s.falseHoldRate),
    decidedWithoutAPerson: pct(s.decidedWithoutAPerson),
  })),
);
console.log(
  `cost             $${result.cost.usd.toFixed(5)} for ${repeats} runs, ${result.cost.msPerRun} ms per run`,
);
