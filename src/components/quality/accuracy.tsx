import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import results from "../../../bench/results/bench.json";
import lanes from "../../../bench/results/lanes.json";

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

// Gateway list prices, USD per million tokens. The same figures the run uses to report its cost.
const PRICE_PER_MILLION = { judge: 0.042, writerIn: 0.75, writerOut: 3.75 };

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : 0;
};

/** What one draft costs, from the app's own recorded runs. */
function draftCost() {
  const runs = lanes.runs.filter((r) => r.lane === "pipeline" && Number.isFinite(r.costUsd));
  const judge = median(runs.map((r) => r.judgeTokens));
  const wIn = median(runs.map((r) => r.writerTokensIn));
  const wOut = median(runs.map((r) => r.writerTokensOut));
  const usd = median(runs.map((r) => r.costUsd));
  const tokens = judge + wIn + wOut;
  return { usd, judge, wIn, wOut, tokens, perMillion: tokens ? (usd / tokens) * 1e6 : 0 };
}

/** The measured numbers, in the words of the person who reads them. Lives on How it works. */
export function Accuracy() {
  const held = results.test.atInUse;
  const cost = draftCost();
  const agent = lanes.lanes.agent;
  const app = lanes.lanes.pipeline;
  const tiles = [
    {
      title: "Bad sentences that got through",
      value: `${held.missRate.missed} of ${held.missRate.n}`,
      note: `Could be as high as ${pct(held.missRate.high)} with this few sentences.`,
    },
    {
      title: "Sound sentences held back",
      value: `${held.falseHoldRate.held} of ${held.falseHoldRate.n}`,
      note: `Could be as high as ${pct(held.falseHoldRate.high)}.`,
    },
    {
      title: "Cost of a draft",
      value: `$${cost.usd.toFixed(3)}`,
      note: `${Math.round(cost.tokens / 1000)},000 tokens. $${cost.perMillion.toFixed(2)} per million.`,
    },
  ];

  return (
    <section id="accuracy" className="flex scroll-mt-6 flex-col gap-6">
      <div>
        <h2 className="font-serif text-3xl leading-tight">
          How often it is wrong, and what it costs
        </h2>
        <p className="mt-2 max-w-[72ch] text-muted-foreground">
          Tested on {held.missRate.n + held.falseHoldRate.n} sentences it had never seen: some
          sound, the rest each with one planted error. Every planted error was caught. That is not
          zero; the numbers say how far from zero it could be.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.title}>
            <CardHeader>
              <CardDescription>{tile.title}</CardDescription>
              <CardTitle className="font-serif text-4xl font-normal tabular-nums">
                {tile.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{tile.note}</CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
        <p>
          The judge reads about {Math.round(cost.judge / 1000)},000 tokens a draft at $
          {PRICE_PER_MILLION.judge} per million. The writer reads {(cost.wIn / 1000).toFixed(1)}
          ,000 and writes {(cost.wOut / 1000).toFixed(1)},000 at ${PRICE_PER_MILLION.writerIn} and $
          {PRICE_PER_MILLION.writerOut}. Middle of {lanes.runsPerLane} runs, list prices. A token is
          about three quarters of a word.
        </p>
        <p>
          An assistant that plans its own steps was built too and measured the same way: about{" "}
          {Math.round((agent.costUsd.median ?? 0) / (app.costUsd.median ?? 1))} times the cost and{" "}
          {Math.round((agent.seconds.median ?? 0) / (app.seconds.median ?? 1))} times the time for a
          draft of similar size, and a different length every run. That is why the app drafts the
          way it does. Most test sentences were written by the engineer, not a practising lawyer,
          and there is one case in one court.
        </p>
      </div>
    </section>
  );
}
