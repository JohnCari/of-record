import type { Metadata } from "next";
import { SweepChart } from "@/components/quality/sweep-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import results from "../../../bench/results/record-faithfulness.json";

export const metadata: Metadata = { title: "Quality, Of Record" };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const CLASS: Record<string, { name: string; what: string }> = {
  supported: { name: "Sound", what: "True sentence, real quote" },
  pure_argument: { name: "Pure argument", what: "Asks for relief, asserts nothing new" },
  fabricated_quote: { name: "Fabricated quote", what: "Quoted words are not in the exhibit" },
  wrong_exhibit: { name: "Wrong exhibit", what: "Real words, cited to a document without them" },
  contradicted: { name: "Contradicted", what: "Real quote, sentence says the opposite" },
  unsupported: { name: "Unsupported", what: "Real quote that does not establish the sentence" },
  overstated: { name: "Overstated", what: "Real quote, sentence claims more than it says" },
  relabelled: { name: "Relabelled", what: "An uncited fact declared as argument" },
};

// The two rows the verifier cleared and should not have, in plain words.
const MISSES: Record<string, { sentence: string; quote: string; why: string }> = {
  "unsupported-02": {
    sentence: "Seller's powder coating process was defective.",
    quote: "the powder coating is chipping on some of the frames from the March shipment",
    why: "A complaint that coating chipped is not evidence that the process was defective. The judge accepted the inference.",
  },
  "unsupported-03": {
    sentence: "Mr. Hale had authority to bind Buyer to the Agreement.",
    quote: "Yes, I signed it.",
    why: "Signing a contract is not testimony about authority to sign it. The judge accepted the inference.",
  },
};

export default function QualityPage() {
  const { headline } = results;
  const tiles = [
    {
      title: "Bad sentences that got through",
      value: `${headline.missRate.missed} of ${headline.missRate.n}`,
      rate: headline.missRate,
      note: "The error that matters. A sentence that should have been held reached the attorney marked as verified.",
    },
    {
      title: "Sound sentences held back",
      value: `${headline.falseHoldRate.held} of ${headline.falseHoldRate.n}`,
      rate: headline.falseHoldRate,
      note: "The cost of caution. Every one of these is attorney time spent on a sentence that was fine.",
    },
    {
      title: "Bad sentences blocked with no person involved",
      value: `${headline.autoBlockedShare.blocked} of ${headline.autoBlockedShare.n}`,
      rate: headline.autoBlockedShare,
      note: "The rest of the bad sentences were sent to review rather than blocked outright.",
    },
  ];

  return (
    <ScrollArea className="h-full">
      <header className="flex items-center gap-3 border-b bg-card px-3 py-2">
        <SidebarTrigger />
        <h1 className="font-serif text-base">Quality</h1>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div className="max-w-[68ch]">
          <h2 className="font-serif text-3xl leading-tight">How often the verifier is wrong</h2>
          <p className="mt-3 text-muted-foreground">
            {results.rows} sentences written by hand against the demo record:{" "}
            {headline.falseHoldRate.n} that are sound and {headline.missRate.n} with a planted
            failure. The verifier ran on all of them, live, {results.repeats} times. These are the
            numbers from commit <code className="text-foreground">{results.commit}</code>, not a
            target.
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
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="tabular-nums">
                  {pct(tile.rate.rate)}, and with this few sentences the true rate could plausibly
                  be anywhere from {pct(tile.rate.low)} to {pct(tile.rate.high)}.
                </p>
                <p className="text-muted-foreground">{tile.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              The two that got through
            </CardTitle>
            <CardDescription>
              Both are the same kind of mistake: the quoted words are real, and the sentence draws a
              conclusion from them that they do not establish.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {headline.missedIds.map((id) => {
              const miss = MISSES[id];
              if (!miss) return <p key={id}>{id}</p>;
              return (
                <div key={id} className="flex flex-col gap-2 rounded-md border p-4">
                  <p className="font-serif text-lg leading-snug">{miss.sentence}</p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Rested on: </span>
                    <mark className="quoted font-serif">{miss.quote}</mark>
                  </p>
                  <p className="text-sm text-muted-foreground">{miss.why}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">By kind of failure</CardTitle>
            <CardDescription>
              Fabricated quotes and wrong exhibits are caught in code, before any model is asked.
              The rest depend on Jev's judgment of whether the passage supports the sentence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Sentences</TableHead>
                  <TableHead className="text-right">Cleared</TableHead>
                  <TableHead className="text-right">Sent to review</TableHead>
                  <TableHead className="text-right">Blocked</TableHead>
                  <TableHead>Should be</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.perClass.map((row) => {
                  const clearedCount = row.verified + row.exempt;
                  const wrong = row.expected === "hold" ? clearedCount : row.review + row.blocked;
                  return (
                    <TableRow key={row.class}>
                      <TableCell>
                        <span className="font-medium">{CLASS[row.class]?.name ?? row.class}</span>
                        <span className="block text-muted-foreground">
                          {CLASS[row.class]?.what}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.n}</TableCell>
                      <TableCell className="text-right tabular-nums">{clearedCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.review}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.blocked}</TableCell>
                      <TableCell>
                        {row.expected === "hold" ? "Held" : "Cleared"}
                        {wrong > 0 && <span className="text-blocked">, {wrong} wrong</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              How confident Jev must be before the system acts alone
            </CardTitle>
            <CardDescription>
              Below the threshold, a judgment is never acted on: the sentence goes to the attorney.
              Raising it catches more and asks a person more often. No new model calls were needed
              for this; the stored judgments were re-routed at each threshold.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SweepChart points={results.sweep} current={results.confidenceThreshold} />
            <Alert>
              <AlertTitle>Why the threshold is still {results.confidenceThreshold}</AlertTitle>
              <AlertDescription>
                At 0.95 both misses would have gone to review and nothing sound would have been
                held. That is a finding about these {results.rows} sentences. Moving the threshold
                because of it, and then reporting the better number on the same sentences, would be
                tuning on the test set. It is a hypothesis to check on sentences the threshold has
                never seen.
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Threshold</TableHead>
                  <TableHead className="text-right">Bad sentences missed</TableHead>
                  <TableHead className="text-right">Sound sentences held</TableHead>
                  <TableHead className="text-right">Decided without a person</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.sweep.map((point) => (
                  <TableRow key={point.threshold}>
                    <TableCell className="tabular-nums">{point.threshold.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {point.missed} ({pct(point.missRate)})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {point.falseHolds} ({pct(point.falseHoldRate)})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(point.decidedWithoutAPerson)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl font-normal">Noise and cost</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                {results.noise.unstableRows} of {results.noise.of} sentences changed status across{" "}
                {results.repeats} identical runs.{" "}
                {results.noise.unstableRows === 0
                  ? "Earlier runs have shown one or two sentences flip, so this is not a guarantee of determinism."
                  : "Jev is not perfectly deterministic: a sentence whose confidence sits on the threshold can land on either side of it."}
              </p>
              {results.noise.detail.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {results.noise.detail.map((row) => (
                    <li key={row.id}>
                      <code>{row.id}</code> moved between {row.statuses.join(" and ")}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                What did not move: bad sentences missed was{" "}
                {[...new Set(results.perRun.map((run) => run.missed))].join(" or ")} in every run,
                and sound sentences held was{" "}
                {[...new Set(results.perRun.map((run) => run.falseHolds))].join(" or ")}. The build
                gate allows exactly the spread observed in those two counts and no more.
              </p>
              <p>
                Verifying all {results.rows} sentences takes about{" "}
                {(results.cost.msPerRun / 1000).toFixed(1)} seconds and costs $
                {(results.cost.usd / results.repeats).toFixed(4)} in judge tokens.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl font-normal">
                What this does not show
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
                {results.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
                <li>
                  Citation checks and the comparison between the two lanes are not measured here
                  yet.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
