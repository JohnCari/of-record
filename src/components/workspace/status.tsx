import { CircleCheck, CircleDashed, CircleHelp, CircleMinus, CircleX, Gavel } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";

export type Sentence = Doc<"sentences">;
export type Adjudication = Doc<"adjudications">;
export type Standing =
  | "verified"
  | "blocked"
  | "review"
  | "exempt"
  | "unverified"
  | "accepted"
  | "struck";

/** Where a sentence stands once the attorney's decisions are taken into account. */
export function standingOf(sentence: Sentence, adjudication?: Adjudication): Standing {
  if (adjudication) return adjudication.decision === "accept" ? "accepted" : "struck";
  return sentence.verification?.status ?? "unverified";
}

export const STANDING: Record<
  Standing,
  { label: string; explain: string; icon: typeof CircleCheck; text: string; mark: string }
> = {
  verified: {
    label: "Verified",
    explain: "The quote is in the source, and the source supports the sentence.",
    icon: CircleCheck,
    text: "text-verified",
    mark: "bg-verified",
  },
  blocked: {
    label: "Blocked",
    explain: "A check failed. Cannot be filed as written.",
    icon: CircleX,
    text: "text-blocked",
    mark: "bg-blocked",
  },
  review: {
    label: "Needs your review",
    explain: "Nothing failed, but the check was not sure. Your call.",
    icon: CircleHelp,
    text: "text-review",
    mark: "bg-review",
  },
  exempt: {
    label: "Argument",
    explain: "States no new fact or rule. Nothing to check.",
    icon: CircleMinus,
    text: "text-exempt",
    mark: "bg-exempt/50",
  },
  unverified: {
    label: "Not yet verified",
    explain: "Not checked yet.",
    icon: CircleDashed,
    text: "text-muted-foreground",
    mark: "bg-muted-foreground/40",
  },
  accepted: {
    label: "Accepted by you",
    explain: "You kept it. Your reason is recorded.",
    icon: Gavel,
    text: "text-primary",
    mark: "bg-primary",
  },
  struck: {
    label: "Struck by you",
    explain: "You struck it. Your reason is recorded.",
    icon: Gavel,
    text: "text-muted-foreground",
    mark: "bg-muted-foreground",
  },
};

const VERDICT: Record<string, string> = {
  verified: "Supported",
  fabricated: "Quote not in the source",
  contradicted: "Source says the opposite",
  unsupported: "Source does not say this",
  fictitious: "No such case",
  mismatched: "Citation is a different case",
  ambiguous: "Could not be decided automatically",
  uncited: "No support cited",
};

export const verdictLabel = (verdict: string) => VERDICT[verdict] ?? verdict;

/** A record cite the way a brief writes it: "Doc. 78-1", and "Doc. 78-1 at 4" once the page is known. */
export function shortCite(docId: string, page?: string): string {
  const doc = docId.startsWith("doc-") ? `Doc. ${docId.slice(4)}` : docId;
  const n = page?.match(/\d+/)?.[0];
  return n ? `${doc} at ${n}` : doc;
}
