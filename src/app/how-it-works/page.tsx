import type { Metadata } from "next";
import { Accuracy } from "@/components/quality/accuracy";
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
];

const HOW = [
  {
    title: "It quotes, it does not paraphrase.",
    body: "The judge, Jev, reads every page and picks the passages that prove each point. They are quoted word for word. It cannot write, so it cannot make a fact up.",
  },
  {
    title: "The writer writes only the sentences that apply the law to the facts.",
    body: "Gemini 3.8 Flash. Those sentences always come to you.",
  },
  {
    title: "Every sentence is checked before you see it.",
    body: "Is the quote in the filing? Is the case real? Does the source support the sentence?",
  },
  {
    title: "Same steps, same order, every time. Nothing signs while a sentence is open.",
    body: "It never chooses what to do next, and the lock is not a rule it follows but a check as you sign.",
  },
];

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
          sub="Jev is by Typesafe AI. Gemini 3.8 Flash is by Google. One chooses, one writes. That is the point."
        >
          <Numbered items={HOW} />
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

        <Separator />

        <Accuracy />

        <p className="text-sm text-muted-foreground">
          The prepared case is real, from public filings on CourtListener. Not affiliated with
          anyone in it; not legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
