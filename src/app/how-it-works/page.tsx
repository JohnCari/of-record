import type { Metadata } from "next";
import { Accuracy } from "@/components/quality/accuracy";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { STANDING, type Standing } from "@/components/workspace/status";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: `How it works, ${APP_NAME}` };

// What the reader does, in order.
const HOW_TO = [
  { title: "Draft the motion", body: "One button, top right. About half a minute." },
  {
    title: "Click a sentence",
    body: "The filing opens at the words it quotes. Green passed, amber is your call, red failed.",
  },
  {
    title: "Decide the amber ones",
    body: "Accept or strike, with a reason. Your reason is kept with the sentence.",
  },
  {
    title: "Sign",
    body: "Only possible once nothing is open. Every sentence is checked again as you sign.",
  },
];

// What the system does, in order, every time.
const STEPS = [
  {
    title: "It reads everything and picks the quotes.",
    body: "Every page of the record, every paragraph of every case. The judge, Jev, picks the passages that prove each point; they are quoted word for word. It cannot write, only choose, so a quoted fact cannot be made up.",
  },
  {
    title: "It writes only the sentences that apply the law to the facts.",
    body: "The writer, Gemini 3.8 Flash, does this and nothing else. Those are the few sentences a lawyer has to judge anyway, so every one of them comes to you.",
  },
  {
    title: "Every sentence is checked before you see it.",
    body: "Is the quote in the filing? Is the case real, and the one named? Does the source support the sentence?",
  },
  {
    title: "Nothing can be signed while a sentence is open.",
    body: "Not a rule it is asked to follow. A lock.",
  },
  {
    title: "Same steps, same order, every time.",
    body: "It never chooses what to do next. Run it twice on the same file and you get the same motion.",
  },
];

const MARKS: Standing[] = ["verified", "blocked", "review", "exempt", "accepted", "struck"];

function Numbered({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-5 sm:grid-cols-2">
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

export default function HowItWorksPage() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h1 className="font-serif text-3xl leading-tight">How to use it</h1>
            <p className="mt-2 text-muted-foreground">Four things, in order.</p>
          </div>
          <Numbered items={HOW_TO} />
        </section>

        <Separator />

        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-serif text-3xl leading-tight">
              It quotes the record. It does not paraphrase it.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Fixed steps, same order, every time. The one part that writes is held to the same
              checks and always comes to you.
            </p>
          </div>
          <Numbered items={STEPS} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-serif text-2xl leading-tight">The marks in the margin</h2>
            <p className="mt-2 text-muted-foreground">Each sentence carries one.</p>
          </div>
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
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 className="font-serif text-2xl leading-tight">Why the judge matters</h2>
            <p className="mt-2 text-muted-foreground">
              Jev is by Typesafe AI. Gemini 3.8 Flash is by Google. They are different kinds of
              model, and the difference is the point.
            </p>
          </div>
          <div className="grid gap-5 text-sm leading-relaxed sm:grid-cols-2">
            <p>
              A writing model answers by writing. Ask it whether a passage supports a sentence and
              it can argue either way, and slip in a fact of its own while doing so. Checking one
              writer with another only moves the problem.
            </p>
            <p>
              Jev does not write. Give it a document and a question with fixed answers and it
              returns one answer and how sure it is. There is nowhere in that reply for an invented
              fact, quote or case. It can be wrong, and that can be counted. It cannot make things
              up. And it is cheap enough to read every page.
            </p>
          </div>
        </section>

        <Separator />

        <Accuracy />

        <p className="text-sm text-muted-foreground">
          The case is real, from public filings on CourtListener. Not affiliated with anyone in it;
          not legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
