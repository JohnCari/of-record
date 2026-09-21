import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STANDING, type Standing } from "@/components/workspace/status";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: `How it works, ${APP_NAME}` };

// A real sequence: each step only happens if the one before it passed.
const STEPS = [
  {
    title: "Facts and rules are selected, not written",
    body: "A model called Jev reads every passage of the case file and every candidate paragraph of an opinion, and says which ones establish what the motion needs. Code then quotes them. Jev cannot write text, only choose among answers, so a fact assembled this way cannot contain a word that is not in the record.",
  },
  {
    title: "A writing model is used for one thing",
    body: "Gemini writes the few sentences that apply the rules to the facts. It never types a quotation or a citation: it names the numbered facts and rules it relies on, and code attaches them. In the Agent tab it does more, and is held to the same checks.",
  },
  {
    title: "Every quote is looked up, word for word",
    body: "If the words are not in the cited filing or opinion, the sentence is blocked. No model is involved and there is no fuzzy matching: a reworded quote is not a quote.",
  },
  {
    title: "Every citation is looked up",
    body: "CourtListener is asked whether the citation is a real case. No such case, a different case than the one named, or a rule number the opinion never mentions, and the sentence is blocked.",
  },
  {
    title: "Jev is asked one narrow question, and may say it is not sure",
    body: "Does this passage support this sentence, contradict it, or not address it? Below the confidence threshold the system does not act on the answer. The sentence comes to you with the passage beside it, and your decision is recorded with your reason.",
  },
  {
    title: "Nothing is signed while a sentence is open",
    body: "The draft can be signed only when every sentence is verified, is pure argument, or has been decided by you. This is enforced in the database at the moment of signing, not by asking a model to behave.",
  },
];

const MARKS: Standing[] = ["verified", "blocked", "review", "exempt", "accepted", "struck"];

export default function HowItWorksPage() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
        <div>
          <h1 className="font-serif text-3xl leading-tight">
            Every sentence has to show its work before you see it
          </h1>
          <p className="mt-3 max-w-[68ch] text-muted-foreground">
            A model that drafts well will also, sometimes, state a fact the record does not contain
            or cite a case that does not exist. {APP_NAME} does not ask the model to be careful. It
            lets a model write as little as possible, makes every sentence checkable, checks it, and
            will not let the draft be signed while any sentence has not passed.
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

        <p className="max-w-[68ch] text-sm text-muted-foreground">
          Jev can be wrong. What it cannot do is invent: it has no way to produce a fact, a quote or
          a case. How often it is wrong is measured on the{" "}
          <Link href="/quality" className="text-foreground underline underline-offset-4">
            Quality page
          </Link>
          . The case file is a real case from public filings on CourtListener. This project is not
          affiliated with anyone in it, and nothing here is legal advice.
        </p>
      </div>
    </ScrollArea>
  );
}
