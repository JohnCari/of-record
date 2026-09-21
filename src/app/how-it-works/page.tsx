import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { STANDING, type Standing } from "@/components/workspace/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "How it works, Of Record" };

// A real sequence: each step only happens if the one before it passed.
const STEPS = [
  {
    title: "The associate writes a sentence and attaches its support",
    body: "A factual sentence carries the exhibit and the exact words it rests on. A legal sentence carries the citation, the case name and the exact words of the opinion. A sentence cannot be written without them.",
  },
  {
    title: "The quote is looked up, word for word",
    body: "If the words are not in the cited exhibit, the sentence is blocked. No model is involved in this step and there is no fuzzy matching: a reworded quote is not a quote.",
  },
  {
    title: "The citation is looked up",
    body: "CourtListener is asked whether the citation is a real case. If there is no such case, or the citation belongs to a different case than the one named, the sentence is blocked.",
  },
  {
    title: "A second model is asked one narrow question",
    body: "Does this passage support this sentence, contradict it, or not address it? The model answering is Jev, which can only choose among those three and say how sure it is. It cannot write anything, so it cannot add a fact or a case of its own.",
  },
  {
    title: "If it is not sure, you decide",
    body: "When Jev's confidence is below the threshold, the system does not act on its answer. The sentence comes to you with the passage beside it. Whatever you decide is recorded with your reason.",
  },
  {
    title: "Nothing is signed while a sentence is open",
    body: "The draft can be signed only when every sentence is verified, is pure argument, or has been decided by you. This is enforced in the database at the moment of signing, not by asking the associate to behave.",
  },
];

const MARKS: Standing[] = ["verified", "blocked", "review", "exempt", "accepted", "struck"];

export default function HowItWorksPage() {
  return (
    <ScrollArea className="h-full">
      <header className="flex items-center gap-3 border-b bg-card px-3 py-2">
        <SidebarTrigger />
        <h1 className="font-serif text-base">How it works</h1>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
        <div>
          <h2 className="font-serif text-3xl leading-tight">
            Every sentence has to show its work before you see it
          </h2>
          <p className="mt-3 max-w-[68ch] text-muted-foreground">
            A model that drafts well will also, sometimes, state a fact the record does not contain
            or cite a case that does not exist. This demo does not try to stop the drafting model
            from making mistakes. It makes each sentence checkable, checks it, and refuses to let
            the draft be signed while any sentence has not passed.
          </p>
        </div>

        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <span className="font-serif text-2xl text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
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

        <Alert>
          <AlertTitle>What it gets wrong</AlertTitle>
          <AlertDescription>
            The checker is measured, not assumed. On 36 sentences with a planted failure it let 2
            through, both of them conclusions the quoted words did not quite establish. The{" "}
            <Link href="/quality" className="underline underline-offset-4">
              Quality page
            </Link>{" "}
            shows the numbers, how uncertain they are, and what they do not cover. The matter here
            is fictional, and nothing in this demo is legal advice.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              Two ways of drafting, one standard
            </CardTitle>
          </CardHeader>
          <CardContent className="flex max-w-[68ch] flex-col gap-3 text-sm leading-relaxed">
            <p>
              In the <span className="font-medium">agentic lane</span> the associate decides for
              itself what to read, what to search for and when to write, using a small fixed set of
              tools. You can talk to it, redirect it, and answer its questions.
            </p>
            <p>
              In the <span className="font-medium">deterministic lane</span> the order of work is
              fixed in advance: extract the facts, find the rules, verify the authority, draft,
              check, repair once, check again.
            </p>
            <p>
              Both end at the same checker and the same gate, so they can be compared on how much of
              what they write survives it, rather than on which design sounds better.
            </p>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
