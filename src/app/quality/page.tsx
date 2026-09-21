import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import { SweepChart } from "@/components/quality/sweep-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APP_NAME } from "@/lib/brand";
import results from "../../../bench/results/bench.json";
import lanes from "../../../bench/results/lanes.json";

export const metadata: Metadata = { title: `Quality, ${APP_NAME}` };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const SETS = [
  {
    id: "record-faithfulness",
    title: "Does the record say that?",
    note: "Sentences about the facts, checked against the real filings.",
  },
  {
    id: "citation-integrity",
    title: "Does the case say that?",
    note: "Sentences about the law, checked against real opinions and a live citation lookup.",
  },
] as const;

const CLASS: Record<string, { name: string; what: string }> = {
  supported: { name: "Sound", what: "True sentence, real quote, real source" },
  pure_argument: { name: "Pure argument", what: "Asks for relief, asserts nothing new" },
  fabricated_quote: { name: "Fabricated quote", what: "Quoted words are not in the filing" },
  wrong_exhibit: { name: "Wrong filing", what: "Real words, cited to a filing without them" },
  contradicted: { name: "Contradicted", what: "Real quote, sentence says the opposite" },
  unsupported: { name: "Unsupported", what: "Real quote that does not establish the sentence" },
  overstated: { name: "Overstated", what: "Real quote, sentence claims more than it says" },
  relabelled: { name: "Relabelled", what: "An uncited fact declared as argument" },
  fictitious: { name: "Fictitious case", what: "A citation that resolves to no case" },
  mismatched: { name: "Wrong name", what: "A real citation under another case's name" },
  misattributed_holding: {
    name: "Misattributed holding",
    what: "Real case, real quote, and it does not state the rule",
  },
  conflated: { name: "Conflated cases", what: "A quote from one case cited to another" },
  wrong_rule: { name: "Wrong rule", what: "Cites a rule number the opinion never mentions" },
};

const LANES = [
  { id: "pipeline", name: "Jev-first pipeline" },
  { id: "agent", name: "Agent" },
  { id: "jev-only", name: "Jev alone, no Gemini" },
] as const;

const LANE_ROWS: { key: string; label: string; format: (x: number) => string }[] = [
  { key: "sentences", label: "Sentences in the motion", format: (x) => x.toFixed(0) },
  { key: "written", label: "Written by Gemini", format: (x) => x.toFixed(0) },
  { key: "verified", label: "Cleared by the verifier", format: (x) => x.toFixed(0) },
  { key: "waitingForAttorney", label: "Waiting for the attorney", format: (x) => x.toFixed(0) },
  { key: "blockedAtFirstCheck", label: "Blocked at the first check", format: (x) => x.toFixed(0) },
  { key: "blockedAtEnd", label: "Still blocked at the end", format: (x) => x.toFixed(0) },
  { key: "authoritiesCited", label: "Opinions cited", format: (x) => x.toFixed(0) },
  { key: "costUsd", label: "Cost per run", format: (x) => `$${x.toFixed(3)}` },
  { key: "seconds", label: "Time per run", format: (x) => `${x.toFixed(0)} s` },
];

type Summary = { median: number | null; low: number | null; high: number | null };

export default function QualityPage() {
  const held = results.test.atInUse;
  const total = SETS.reduce((sum, set) => sum + results.datasets[set.id].rows, 0);
  const tiles = [
    {
      title: "Bad sentences that got through",
      value: `${held.missRate.missed} of ${held.missRate.n}`,
      rate: held.missRate,
      note: "The error that matters: a sentence that should have been held, marked as verified.",
    },
    {
      title: "Sound sentences held back",
      value: `${held.falseHoldRate.held} of ${held.falseHoldRate.n}`,
      rate: held.falseHoldRate,
      note: "The cost of caution: attorney time spent on a sentence that was fine.",
    },
    {
      title: "Bad sentences blocked with no person involved",
      value: `${held.autoBlockedShare.blocked} of ${held.autoBlockedShare.n}`,
      rate: held.autoBlockedShare,
      note: "The rest were sent to the attorney rather than blocked outright.",
    },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div className="max-w-[68ch]">
          <h1 className="font-serif text-3xl leading-tight">How often the verifier is wrong</h1>
          <p className="mt-3 text-muted-foreground">
            {total} test sentences written against the real case file and real opinions. Some are
            sound. The rest each carry one planted failure, the kinds a drafting model actually
            makes. Half the sentences were set aside before any setting was chosen, and the numbers
            below come from that half only. They are measurements from commit{" "}
            <code className="text-foreground">{results.commit}</code>, not targets.
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
                  {pct(tile.rate.rate)}. With this few sentences the true rate could plausibly be
                  anywhere from {pct(tile.rate.low)} to {pct(tile.rate.high)}.
                </p>
                <p className="text-muted-foreground">{tile.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {held.missRate.missed === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl font-normal">
                Nothing got through. That is not the same as zero.
              </CardTitle>
            </CardHeader>
            <CardContent className="max-w-[72ch] text-sm text-muted-foreground">
              {held.missRate.n} held-out bad sentences cannot rule out a miss rate as high as{" "}
              {pct(held.missRate.high)}. The kinds to watch are the two that rest on Jev's judgment
              rather than on code: a real quote that does not establish the sentence, and a sentence
              that claims more than its quote. Most of those were sent to the attorney rather than
              blocked. That is the design working, and it is also where a miss would come from.
            </CardContent>
          </Card>
        )}

        {SETS.map((set) => (
          <Card key={set.id}>
            <CardHeader>
              <CardTitle className="font-serif text-xl font-normal">{set.title}</CardTitle>
              <CardDescription>{set.note}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead className="text-right">Sentences</TableHead>
                    <TableHead className="text-right">Cleared</TableHead>
                    <TableHead className="text-right">To the attorney</TableHead>
                    <TableHead className="text-right">Blocked</TableHead>
                    <TableHead>Should be</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.datasets[set.id].perClass.map((row) => {
                    const wrong = row.expected === "hold" ? row.cleared : row.review + row.blocked;
                    return (
                      <TableRow key={row.class}>
                        <TableCell>
                          <span className="font-medium">{CLASS[row.class]?.name ?? row.class}</span>
                          <span className="block text-muted-foreground">
                            {CLASS[row.class]?.what}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.n}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.cleared}</TableCell>
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
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              Three ways to draft the same motion
            </CardTitle>
            <CardDescription>
              Same case file, same task, {lanes.runsPerLane} runs each. The middle run is shown,
              with the range the middle could plausibly fall in. This few runs can show a large
              difference. It cannot rank two columns whose ranges overlap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Per run</TableHead>
                  {LANES.map((lane) => (
                    <TableHead key={lane.id} className="text-right">
                      {lane.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {LANE_ROWS.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    {LANES.map((lane) => {
                      const s = (lanes.lanes[lane.id] as unknown as Record<string, Summary>)[
                        row.key
                      ];
                      return (
                        <TableCell key={lane.id} className="text-right tabular-nums">
                          {s?.median == null ? (
                            "not run"
                          ) : (
                            <>
                              {row.format(s.median)}
                              <span className="block text-xs text-muted-foreground">
                                {row.format(s.low ?? s.median)} to {row.format(s.high ?? s.median)}
                              </span>
                            </>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Collapsible className="rounded-xl border bg-card">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 rounded-xl px-6 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span>
              <span className="block font-serif text-xl">
                How sure Jev must be before the system acts alone
              </span>
              <span className="block text-sm text-muted-foreground">
                The threshold is {results.thresholdInUse}. How it was chosen, the run-to-run noise
                and the cost.
              </span>
            </span>
            <ChevronDown
              className="size-5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4 px-6 pb-6 text-sm">
            <p className="max-w-[72ch] text-muted-foreground">
              Below the threshold a judgment is never acted on: the sentence goes to the attorney.
              The threshold was examined on the {results.dev.rows} development sentences only.
              Anything from 0.5 to 0.95 made no mistakes there, so the data cannot tell them apart,
              and the more cautious {results.thresholdInUse} stays. At 0.99 sound sentences start
              being held.
            </p>
            <SweepChart points={results.dev.sweep} current={results.thresholdInUse} />
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
                {results.dev.sweep.map((point) => (
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
            <p className="max-w-[72ch] text-muted-foreground">
              {SETS.reduce((sum, set) => sum + results.datasets[set.id].noise.unstableRows, 0)} of{" "}
              {total} sentences changed status across {results.repeats} identical runs. Earlier runs
              have shown one or two flip, so this is not a promise of determinism; the build gate
              allows exactly the spread that was observed and no more. Verifying all {total}{" "}
              sentences takes about {(results.cost.msPerRun / 1000).toFixed(0)} seconds and costs $
              {(results.cost.usd / results.repeats).toFixed(4)} in judge tokens.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              What this does not show
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex max-w-[72ch] list-disc flex-col gap-2 pl-5 text-sm">
              {results.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
