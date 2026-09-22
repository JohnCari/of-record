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

  const rows = [
    {
      label: "The test",
      text: `${held.missRate.n + held.falseHoldRate.n} sentences it had never seen. ${held.falseHoldRate.n} were sound; ${held.missRate.n} each carried one planted error, the kind an AI drafter makes.`,
    },
    {
      label: "The result",
      text: `Every planted error was caught and no sound sentence was held back. With this few sentences the true miss rate could still be as high as ${pct(held.missRate.high)}, so the honest reading is "low", not "zero".`,
    },
    {
      label: "The cost",
      text: `$${cost.usd.toFixed(3)} a draft: the judge reads about ${Math.round(cost.judge / 1000)},000 tokens at $${PRICE_PER_MILLION.judge} per million; the writer reads ${(cost.wIn / 1000).toFixed(1)},000 and writes ${(cost.wOut / 1000).toFixed(1)},000 at $${PRICE_PER_MILLION.writerIn} and $${PRICE_PER_MILLION.writerOut}. A token is about three quarters of a word.`,
    },
    {
      label: "Why it drafts this way",
      text: `An assistant that plans its own steps was built too and measured the same way. For a draft of similar size it cost about ${Math.round((agent.costUsd.median ?? 0) / (app.costUsd.median ?? 1))} times more, took about ${Math.round((agent.seconds.median ?? 0) / (app.seconds.median ?? 1))} times longer, and came out a different length every run.`,
    },
    {
      label: "What this does not show",
      text: "Most test sentences were written by the engineer, not a practising lawyer. One case, one court. Middle of eight runs at list prices.",
    },
  ];

  return (
    <section id="accuracy" className="flex scroll-mt-6 flex-col gap-6">
      <h2 className="font-serif text-3xl leading-tight">
        How often it is wrong, and what it costs
      </h2>

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

      <dl className="grid gap-x-8 gap-y-4 text-sm leading-relaxed md:grid-cols-[12rem_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium">{row.label}</dt>
            <dd className="max-w-[80ch] text-muted-foreground">{row.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
