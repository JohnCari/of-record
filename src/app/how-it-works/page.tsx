import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { STANDING, type Standing } from "@/components/workspace/status";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: `How it works, ${APP_NAME}` };

const HOW_TO = [
  { title: "Choose a case", body: "The prepared one, or attach your own filings." },
  { title: "Draft the motion", body: "One button. About half a minute." },
  { title: "Click a sentence", body: "The filing opens at the words it quotes." },
  { title: "Decide the amber ones", body: "Accept or strike, with a reason." },
  { title: "Sign", body: "Only once nothing is open." },
  { title: "Find it again", body: "Under Signed drafts. Print it from there." },
];

const HOW = [
  {
    title: "It quotes. It does not paraphrase.",
    body: "Jev reads every page and picks the passages that prove each point. They go in word for word.",
  },
  {
    title: "Gemini writes only the few sentences that connect the facts to the law.",
    body: "Those always come to you to decide.",
  },
  {
    title: "Every sentence is checked before you see it.",
    body: "Is the quote really in the filing? Is the case real? Does the source say what the sentence says?",
  },
  {
    title: "You cannot sign while any sentence is open.",
    body: "Same steps in the same order every time. The lock is checked again as you sign.",
  },
];

// The two models, each named by what it can and cannot do. The split is the design.
const MODELS = [
  {
    name: "Jev",
    role: "Picks",
    good: [
      "Reads every page of the case file for about a cent.",
      "Points to the passage that proves a point, and says how sure it is.",
      "Cannot make anything up. It can only pick from what is already there.",
    ],
    bad: ["Cannot write.", "Can pick the wrong passage. That is why it is tested."],
  },
  {
    name: "Gemini",
    role: "Writes",
    good: ["Writes a clear sentence that says what the facts mean under the law."],
    bad: ["Can invent a fact, a quote or a case, and sound sure of it.", "Costs far more to read."],
  },
];

const TOGETHER =
  "Jev picks the facts and the law, and they are quoted word for word, so nothing there can be invented. Gemini only writes the few sentences that connect them, from numbered facts and rules it cannot change, and every one of those comes to you. Each does what the other cannot.";

const MARKS: Standing[] = ["verified", "blocked", "review", "exempt", "accepted", "struck"];

function Numbered({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {items.map((step, i) => (
        <li key={step.title} className="grid min-w-0 grid-cols-[2rem_1fr] gap-2">
          <span className="font-serif text-2xl text-muted-foreground tabular-nums">{i + 1}</span>
          <div className="min-w-0">
            <h3 className="font-medium">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <div>
        <h2 className="font-serif text-2xl leading-tight">{title}</h2>
        {sub && <p className="mt-2 text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8 lg:px-10">
        <Section title="How to use it">
          <Numbered items={HOW_TO} />
        </Section>

        <Separator />

        <Section
          title="How it works"
          sub="Two models. One picks, one writes. Neither is trusted with the other's job."
        >
          <Numbered items={HOW} />
        </Section>

        <Section title="Two models, one job each" sub={TOGETHER}>
          <div className="grid gap-4 sm:grid-cols-2">
            {MODELS.map((model) => (
              <Card key={model.name}>
                <CardHeader>
                  <CardDescription>{model.role}</CardDescription>
                  <CardTitle className="font-serif text-2xl font-normal">{model.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
                  <ul className="flex flex-col gap-1">
                    {model.good.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-1 size-3.5 shrink-0 text-verified" aria-label="Can" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-col gap-1 text-muted-foreground">
                    {model.bad.map((line) => (
                      <li key={line} className="flex gap-2">
                        <X className="mt-1 size-3.5 shrink-0 text-blocked" aria-label="Cannot" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="The marks in the margin">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {MARKS.map((standing) => {
              const meta = STANDING[standing];
              return (
                <div key={standing} className="flex min-w-0 gap-3">
                  <span className={cn("mt-1 h-10 w-1 shrink-0 rounded-full", meta.mark)} />
                  <div className="min-w-0">
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-sm leading-relaxed break-words text-muted-foreground">
                      {meta.explain}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <p className="text-sm text-muted-foreground">
          The prepared case is real, from public filings on CourtListener. Not affiliated with
          anyone in it; not legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
