import { z } from "zod";

/** What the drafter must produce. Schema-constrained so a sentence cannot exist without its cites. */
export const recordCiteSchema = z.object({
  docId: z.string().describe("doc_id of the record document, e.g. ex-d"),
  quote: z
    .string()
    .describe(
      "Verbatim words copied from that document that support the sentence",
    ),
});

export const authorityCiteSchema = z.object({
  citation: z
    .string()
    .describe("Reporter citation exactly as verified, e.g. 123 P.3d 456"),
  caseName: z.string().describe("Case name as verified, e.g. Smith v. Jones"),
  quote: z
    .string()
    .describe("Verbatim words copied from the opinion that state the rule"),
});

export const sentenceKindSchema = z.enum(["fact", "law", "argument"]);

export const draftSentenceSchema = z.object({
  text: z.string().min(1),
  kind: sentenceKindSchema.describe(
    "fact: asserts something about this case. law: states a legal rule or what a court held. argument: applies law to fact or asks for relief, asserting nothing new.",
  ),
  recordCites: z.array(recordCiteSchema).default([]),
  authorityCites: z.array(authorityCiteSchema).default([]),
});

export type RecordCite = z.infer<typeof recordCiteSchema>;
export type AuthorityCite = z.infer<typeof authorityCiteSchema>;
export type SentenceKind = z.infer<typeof sentenceKindSchema>;
export type DraftSentence = z.infer<typeof draftSentenceSchema> & {
  id: string;
};

/**
 * verified      the cite exists, the quote is really there, and the passage supports the sentence
 * fabricated    the quote, the document or the exhibit does not exist
 * contradicted  the passage says the opposite
 * unsupported   the passage is real but does not say this
 * fictitious    the citation resolves to no case
 * mismatched    the citation resolves, but to a different case than the one named
 * ambiguous     the citation resolves to more than one case
 * uncited       the sentence asserts fact or law and carries no cite for it
 */
export type Verdict =
  | "verified"
  | "fabricated"
  | "contradicted"
  | "unsupported"
  | "fictitious"
  | "mismatched"
  | "ambiguous"
  | "uncited";

export type Evidence = {
  sourceId: string;
  sourceTitle: string;
  section: string;
  passage: string;
  url?: string;
};

export type Check = {
  target: "record" | "authority" | "sentence";
  citeIndex: number | null;
  verdict: Verdict;
  /** "code" checks involve no model and are deterministic. "jev" checks carry a confidence. */
  stage: "code" | "jev";
  confidence: number | null;
  probabilities?: Record<string, number>;
  evidence?: Evidence;
  reason: string;
};

/**
 * verified  every check passed at or above the confidence threshold
 * blocked   at least one check failed; the sentence cannot ship as written
 * review    nothing failed, but at least one judgment was below threshold or ambiguous
 * exempt    pure argument: asserts no fact and states no rule, so there is nothing to ground
 */
export type SentenceStatus = "verified" | "blocked" | "review" | "exempt";

export type SentenceVerification = {
  sentenceId: string;
  declaredKind: SentenceKind;
  effectiveKind: SentenceKind;
  status: SentenceStatus;
  checks: Check[];
};

export const BLOCKING: ReadonlySet<Verdict> = new Set([
  "fabricated",
  "contradicted",
  "unsupported",
  "fictitious",
  "mismatched",
  "uncited",
]);
