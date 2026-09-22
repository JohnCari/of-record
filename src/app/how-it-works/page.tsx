import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STANDING, type Standing } from "@/components/workspace/status";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: `How it works, ${APP_NAME}` };

// A real sequence: this is the order the steps run in, every time.
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
    body: "Is the quote in the filing? Is the case real, and the one named? Does the source support the sentence? Green passed. Red failed. Amber is your call, source beside it.",
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

export default function HowItWorksPage() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
        <div>
          <h1 className="font-serif text-3xl leading-tight">
            It quotes the record. It does not paraphrase it.
          </h1>
          <p className="mt-3 max-w-[68ch] text-muted-foreground">
            Fixed steps, same order, every time. The one part that writes is held to the same checks
            and always comes to you.
          </p>
        </div>

        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <span className="font-serif text-2xl text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div>
                <h2 className="font-medium">{step.title}</h2>
                <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              The marks in the margin
            </CardTitle>
            <CardDescription>Each sentence in the draft carries one of these.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {MARKS.map((standing) => {
              const meta = STANDING[standing];
              return (
                <div key={standing} className="flex gap-3">
                  <span className={cn("mt-1 h-10 w-1 shrink-0 rounded-full", meta.mark)} />
                  <div>
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-sm text-muted-foreground">{meta.explain}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">Why the judge matters</CardTitle>
            <CardDescription>
              Jev is by Typesafe AI. Gemini 3.8 Flash is by Google. They are different kinds of
              model, and the difference is the point.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-w-[68ch] flex-col gap-3 text-sm leading-relaxed">
            <p>
              A writing model answers by writing. Ask it whether a passage supports a sentence and
              it can argue either way, and slip in a fact of its own while doing so. Checking one
              writer with another only moves the problem.
            </p>
            <p>
              Jev does not write. Give it a document and a question with fixed answers, supports,
              contradicts or says nothing, and it returns one answer and how sure it is. There is
              nowhere in that reply for an invented fact, quote or case. It can be wrong, and that
              can be counted. It cannot make things up. And it is cheap enough to read every page,
              so the draft is built from what the record says rather than from a search and a hope.
            </p>
          </CardContent>
        </Card>

        <p className="max-w-[68ch] text-sm text-muted-foreground">
          How often the judge is wrong is on the{" "}
          <Link href="/quality" className="text-foreground underline underline-offset-4">
            Accuracy page
          </Link>
          . The case is real, from public filings on CourtListener. Not affiliated with anyone in
          it; not legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
