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
    body: "Every page of the record and every paragraph of every case. The judge, Jev, chooses the passages that prove each point, and they are quoted word for word. It cannot write, only choose, so a quoted fact cannot be made up.",
  },
  {
    title: "It writes only the sentences that apply the law to the facts.",
    body: "The writer, Gemini 3.8 Flash, does this and nothing else. Those are the few sentences a lawyer has to judge anyway, so every one of them comes to you.",
  },
  {
    title: "Every sentence is checked before you see it.",
    body: "Is the quote really in the filing? Is the case real, and is it the case named? Does the source support the sentence? Green passed. Red failed. Amber is your call, with the source beside it.",
  },
  {
    title: "Nothing can be signed while a sentence is open.",
    body: "Not a rule it is asked to follow. A lock.",
  },
  {
    title: "Same steps, same order, every time.",
    body: "It never chooses what to do next. Run it twice on the same file and you get the same motion, so you can rely on it the way you rely on a checklist.",
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
            The steps are fixed and the same every time: the same record, the same points, the same
            checks, in the same order. The one part that writes is held to the same checks and
            always comes to you.
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
              Jev is made by Typesafe AI. Gemini 3.8 Flash is made by Google. They are different
              kinds of model, and the difference is the whole point.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-w-[68ch] flex-col gap-3 text-sm leading-relaxed">
            <p>
              A writing model answers a question by writing. Ask it whether a passage supports a
              sentence and it can produce a convincing explanation either way, and it can slip in a
              fact of its own while doing so. Checking one writer with another writer only moves the
              problem.
            </p>
            <p>
              Jev does not write. You give it a document and a question with fixed answers, such as
              supports, contradicts, or says nothing, and it returns one answer and how sure it is.
              There is nowhere in that reply for an invented fact, a made-up quote or a case that
              does not exist. It can be wrong, and that can be counted. It cannot make things up.
            </p>
            <p>
              That changes what a system built on documents can do. Instead of searching for a few
              passages and hoping the writer stays close to them, Jev reads every passage, for a
              fraction of a cent, and says which ones prove each point. The draft is then assembled
              from what the record actually says, and the same judge checks every sentence before
              you see it. Reading everything, deciding without writing, and being sure or not sure
              out loud is what makes it a judge you can build on.
            </p>
          </CardContent>
        </Card>

        <p className="max-w-[68ch] text-sm text-muted-foreground">
          The judge can be wrong. It cannot make things up. How often it is wrong is on the{" "}
          <Link href="/quality" className="text-foreground underline underline-offset-4">
            Accuracy page
          </Link>
          . The case file is a real case from public filings on CourtListener. This project is not
          affiliated with anyone in it, and nothing here is legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
