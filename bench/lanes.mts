// Compares the drafting lanes on the same matter and the same task, many runs each.
//   pnpm bench:lanes                    8 runs per lane (needs `pnpm dev` running for the agent)
//   pnpm bench:lanes -- --runs 3 --only pipeline
// Every number is read back from what the run stored, never from what a model said it did.
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getBackend } from "../src/lib/drafting/backend";
import { runPipeline } from "../src/lib/pipeline/run";

const exec = promisify(execFile);
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const RUNS = Number(arg("runs") ?? 8);
const ONLY = arg("only");
const URL = arg("url") ?? "http://localhost:3000";
const AGENT_PROMPT = "Draft the whole motion. Verify every citation before you use it.";
const OUT = join(process.cwd(), "bench/results/lanes.json");

const LANES = ["agent", "pipeline", "jev-only"] as const;
type Lane = (typeof LANES)[number];

type Run = {
  lane: Lane;
  draftId: string;
  sentences: number;
  /** Sentences a generative model wrote, as opposed to quotations code assembled. */
  written: number;
  verified: number;
  waitingForAttorney: number;
  blockedAtEnd: number;
  /** Blocked the first time the verifier ran, before anything was repaired or dropped. */
  blockedAtFirstCheck: number;
  authoritiesCited: number;
  costUsd: number;
  /** Tokens the judge read and the writer read and wrote, from what the run stored. */
  judgeTokens: number;
  writerTokensIn: number;
  writerTokensOut: number;
  seconds: number;
  /** How the agent's turn ended: ready, or input-required when it parked on a question. */
  endedAs?: string;
  error?: string;
};

const backend = getBackend();

async function measure(
  lane: Lane,
  draftId: Id<"drafts">,
  seconds: number,
  cost?: number,
): Promise<Run> {
  const stored = await backend.convex.query(api.drafts.get, { draftId });
  if (!stored) throw new Error(`draft ${draftId} was not stored`);
  const status = (s: (typeof stored.sentences)[number]) => s.verification?.status ?? "unverified";
  const firstCheck =
    lane === "agent"
      ? stored.events.find((e) => e.type === "verify")?.label.match(/(\d+) blocked/)?.[1]
      : stored.events.find((e) => /^dropping/i.test(e.label))?.label.match(/\d+/)?.[0];
  return {
    lane,
    draftId,
    sentences: stored.sentences.length,
    written:
      lane === "agent"
        ? stored.sentences.length
        : stored.sentences.filter((s) => s.origin === "written").length,
    verified: stored.sentences.filter((s) => ["verified", "exempt"].includes(status(s))).length,
    waitingForAttorney: stored.sentences.filter((s) => status(s) === "review").length,
    blockedAtEnd: stored.sentences.filter((s) => status(s) === "blocked").length,
    blockedAtFirstCheck: Number(firstCheck ?? 0),
    authoritiesCited: new Set(
      stored.sentences.flatMap((s) => s.authorityCites.map((c) => c.citation)),
    ).size,
    costUsd: cost ?? stored.draft.usage.costUsd,
    judgeTokens: stored.draft.usage.judgeInputTokens,
    writerTokensIn: stored.draft.usage.drafterInputTokens,
    writerTokensOut: stored.draft.usage.drafterOutputTokens,
    seconds,
  };
}

async function agentRun(): Promise<Run> {
  const started = Date.now();
  // Exit code 3 means the agent parked on a question for the attorney, which is a finished run here.
  const { stdout } = await exec("npx", ["eve", "invoke", "--url", URL, AGENT_PROMPT], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60_000,
  }).catch((error: { code?: number; stdout?: string }) => {
    if (error.code === 3 && error.stdout) return { stdout: error.stdout };
    throw error;
  });
  const seconds = (Date.now() - started) / 1000;
  const invoked = JSON.parse(stdout);
  const sessionId = invoked.resume?.session?.sessionId as string | undefined;
  if (!sessionId) throw new Error("eve invoke returned no session id");
  const draftId = await backend.convex.query(api.drafts.bySession, { sessionId });
  if (!draftId) throw new Error(`session ${sessionId} stored no draft`);
  // The drafter's spend comes from the gateway cost on the run's trace. Jev's share inside the
  // tools is not on the trace; at list price it is under half a cent a run.
  const trace = await exec("npx", ["eve", "traces", sessionId], { maxBuffer: 64 * 1024 * 1024 });
  const cost = Number(trace.stdout.match(/^Cost\s+\$([\d.]+)/m)?.[1] ?? Number.NaN);
  return { ...(await measure("agent", draftId, seconds, cost)), endedAs: invoked.status };
}

async function pipelineRun(lane: "pipeline" | "jev-only"): Promise<Run> {
  const started = Date.now();
  const { draftId } = await runPipeline(backend, undefined, { generative: lane === "pipeline" });
  return measure(lane, draftId, (Date.now() - started) / 1000);
}

// A small seeded generator so the intervals are the same every time the file is rebuilt.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
function summarise(values: number[]) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { median: null, low: null, high: null };
  const random = mulberry32(20260921);
  const medians = Array.from({ length: 2000 }, () =>
    median(clean.map(() => clean[Math.floor(random() * clean.length)])),
  ).sort((a, b) => a - b);
  return { median: median(clean), low: medians[49], high: medians[1949] };
}

const METRICS = [
  "sentences",
  "written",
  "verified",
  "waitingForAttorney",
  "blockedAtEnd",
  "blockedAtFirstCheck",
  "authoritiesCited",
  "costUsd",
  "judgeTokens",
  "writerTokensIn",
  "writerTokensOut",
  "seconds",
] as const;

const previous: Run[] = await readFile(OUT, "utf8")
  .then((text) => JSON.parse(text).runs as Run[])
  .catch(() => []);
const runs: Run[] = ONLY ? previous.filter((r) => r.lane !== ONLY) : [];

async function save() {
  const done = runs.filter((r) => !r.error);
  const result = {
    generatedAt: new Date().toISOString(),
    task: AGENT_PROMPT,
    runsPerLane: RUNS,
    lanes: Object.fromEntries(
      LANES.map((lane) => {
        const mine = done.filter((r) => r.lane === lane);
        return [
          lane,
          {
            runs: mine.length,
            failed: runs.filter((r) => r.lane === lane && r.error).length,
            ...Object.fromEntries(METRICS.map((m) => [m, summarise(mine.map((r) => r[m]))])),
          },
        ];
      }),
    ),
    reading:
      "Medians with 95% bootstrap intervals. Eight runs can show a difference of several sentences or a several-fold difference in cost. They cannot rank two lanes whose intervals overlap, and they say nothing about a different matter.",
    runs,
  };
  await mkdir(join(process.cwd(), "bench/results"), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

for (const lane of LANES) {
  if (ONLY && lane !== ONLY) continue;
  // Two at a time: enough to finish in reasonable time, not enough to trip a rate limit.
  for (let i = 0; i < RUNS; i += 2) {
    const batch = Array.from({ length: Math.min(2, RUNS - i) }, () =>
      (lane === "agent" ? agentRun() : pipelineRun(lane)).catch(
        (error): Run => ({
          lane,
          draftId: "",
          sentences: Number.NaN,
          written: Number.NaN,
          verified: Number.NaN,
          waitingForAttorney: Number.NaN,
          blockedAtEnd: Number.NaN,
          blockedAtFirstCheck: Number.NaN,
          authoritiesCited: Number.NaN,
          costUsd: Number.NaN,
          judgeTokens: Number.NaN,
          writerTokensIn: Number.NaN,
          writerTokensOut: Number.NaN,
          seconds: Number.NaN,
          error: error instanceof Error ? error.message.slice(0, 300) : String(error),
        }),
      ),
    );
    for (const run of await Promise.all(batch)) {
      runs.push(run);
      console.log(
        run.error
          ? `${lane}: FAILED ${run.error}`
          : `${lane}: ${run.sentences} sentences, ${run.verified} verified, ${run.waitingForAttorney} waiting, ${run.blockedAtEnd} blocked, $${run.costUsd.toFixed(4)}, ${run.seconds.toFixed(0)} s`,
      );
    }
    await save();
  }
}

const result = await save();
console.table(
  Object.fromEntries(
    Object.entries(result.lanes).map(([lane, s]) => [
      lane,
      Object.fromEntries(
        METRICS.map((m) => {
          const v = (s as unknown as Record<string, { median: number | null }>)[m];
          return [m, v.median === null ? "-" : Number(v.median.toFixed(4))];
        }),
      ),
    ]),
  ),
);
