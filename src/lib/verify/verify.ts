import type { Judge, SupportQuestion } from "./judge";
import { locateQuote } from "./locate";
import {
  type AuthorityResolver,
  caseNameMatch,
  NAME_MATCH,
  NAME_MISMATCH,
  type RecordStore,
  type ResolvedCitation,
} from "./sources";
import {
  BLOCKING,
  type Check,
  type DraftSentence,
  type Evidence,
  type SentenceKind,
  type SentenceStatus,
  type SentenceVerification,
  type Verdict,
} from "./types";

export type VerifyOptions = {
  /** A judgment below this confidence is never acted on automatically. Calibrated on the bench. */
  confidenceThreshold: number;
  /** Probability at which the judge's reading of a sentence overrides a declared "argument". */
  kindThreshold: number;
  signal?: AbortSignal;
};

export const DEFAULT_OPTIONS: VerifyOptions = {
  confidenceThreshold: 0.8,
  kindThreshold: 0.5,
};

export type VerifyDeps = {
  record: RecordStore;
  authorities: AuthorityResolver;
  judge: Judge;
};

type Pending = { sentenceId: string; check: Check & { premise?: boolean } };

// The confidence is carried on the check itself, so the sentence a person reads stays plain.
const RELATION_REASON: Record<string, string> = {
  supports: "The cited passage supports the sentence.",
  contradicts: "The cited passage says the opposite of the sentence.",
  says_nothing: "The cited passage is real, but it does not say this.",
};

const PREMISE_REASON: Record<string, string> = {
  supports: "The cited passage establishes something this sentence relies on.",
  contradicts: "The cited passage contradicts something this sentence relies on.",
  says_nothing: "The cited passage does not bear on anything this sentence relies on.",
};

const RELATION_VERDICT: Record<string, Verdict> = {
  supports: "verified",
  contradicts: "contradicted",
  says_nothing: "unsupported",
};

export async function verifySentences(
  sentences: DraftSentence[],
  deps: VerifyDeps,
  options: VerifyOptions = DEFAULT_OPTIONS,
): Promise<SentenceVerification[]> {
  const checks = new Map<string, Check[]>(sentences.map((s) => [s.id, []]));
  const questions: SupportQuestion[] = [];
  const pending = new Map<string, Pending>();

  // Resolve each distinct citation once; a motion cites the same case many times.
  const resolved = new Map<string, Promise<ResolvedCitation>>();
  const resolve = (citation: string) => {
    const key = citation.trim();
    if (!resolved.has(key)) resolved.set(key, deps.authorities.resolve(key));
    return resolved.get(key) as Promise<ResolvedCitation>;
  };

  // Stage 1: code only. Anything that fails here never reaches a model.
  for (const sentence of sentences) {
    const out = checks.get(sentence.id) as Check[];

    for (const [citeIndex, cite] of sentence.recordCites.entries()) {
      const base = {
        target: "record" as const,
        citeIndex,
        stage: "code" as const,
        confidence: null,
      };
      const doc = await deps.record.get(cite.docId);
      if (!doc) {
        out.push({
          ...base,
          verdict: "fabricated",
          reason: `no record document has the id "${cite.docId}"`,
        });
        continue;
      }
      const located = locateQuote(cite.quote, doc.passages);
      if (!located.found) {
        out.push({ ...base, verdict: "fabricated", reason: located.reason });
        continue;
      }
      const evidence: Evidence = {
        sourceId: doc.id,
        sourceTitle: doc.title,
        section: located.passage.section,
        passage: located.passage.text,
      };
      const id = `${sentence.id}:r${citeIndex}`;
      questions.push({
        id,
        mode: sentence.kind === "argument" ? "premise" : "fact",
        claim: sentence.text,
        passage: located.context,
      });
      pending.set(id, {
        sentenceId: sentence.id,
        check: {
          ...base,
          stage: "jev",
          verdict: "unsupported",
          evidence,
          reason: "",
          premise: sentence.kind === "argument",
        },
      });
    }

    for (const [citeIndex, cite] of sentence.authorityCites.entries()) {
      const base = {
        target: "authority" as const,
        citeIndex,
        stage: "code" as const,
        confidence: null,
      };
      const result = await resolve(cite.citation);

      if (result.status === "not_found") {
        out.push({
          ...base,
          verdict: "fictitious",
          reason: `"${cite.citation}" resolves to no reported case`,
        });
        continue;
      }
      if (result.status === "invalid") {
        out.push({ ...base, verdict: "fictitious", reason: result.message });
        continue;
      }
      if (result.status === "ambiguous") {
        out.push({
          ...base,
          verdict: "ambiguous",
          reason: `"${cite.citation}" matches more than one case: ${result.candidates.join("; ")}`,
        });
        continue;
      }
      if (result.status === "unavailable") {
        // An outage says nothing about the case. Hold the sentence for a person.
        out.push({
          ...base,
          verdict: "ambiguous",
          reason: `could not check "${cite.citation}": ${result.message}`,
        });
        continue;
      }

      const { authority } = result;
      const nameScore = caseNameMatch(cite.caseName, authority.caseName);
      if (nameScore < NAME_MISMATCH) {
        out.push({
          ...base,
          verdict: "mismatched",
          reason: `"${cite.citation}" is ${authority.caseName}, not ${cite.caseName}`,
        });
        continue;
      }

      const located = locateQuote(cite.quote, authority.passages);
      if (!located.found) {
        out.push({
          ...base,
          verdict: "fabricated",
          reason: `${located.reason} (${authority.caseName})`,
        });
        continue;
      }
      const evidence: Evidence = {
        sourceId: authority.id,
        sourceTitle: `${authority.caseName}, ${authority.citation}`,
        section: located.passage.section,
        passage: located.passage.text,
        url: authority.url,
      };
      if (nameScore < NAME_MATCH) {
        out.push({
          ...base,
          verdict: "ambiguous",
          evidence,
          reason: `case name "${cite.caseName}" only loosely matches "${authority.caseName}"`,
        });
      }
      const id = `${sentence.id}:a${citeIndex}`;
      questions.push({
        id,
        mode: sentence.kind === "argument" ? "premise" : "law",
        claim: sentence.text,
        passage: located.context,
      });
      pending.set(id, {
        sentenceId: sentence.id,
        check: {
          ...base,
          stage: "jev",
          verdict: "unsupported",
          evidence,
          reason: "",
          premise: sentence.kind === "argument",
        },
      });
    }
  }

  // Stage 2: the judge. One batched pass for support, one for what each sentence really asserts.
  const [support, kinds] = await Promise.all([
    deps.judge.support(questions, options.signal),
    deps.judge.classify(
      sentences.map((s) => ({ id: s.id, text: s.text })),
      options.signal,
    ),
  ]);

  for (const [id, { sentenceId, check: pendingCheck }] of pending) {
    // `premise` only selects the wording below; it is not part of the stored check.
    const { premise, ...check } = pendingCheck;
    const answer = support.get(id);
    if (!answer) {
      // No answer is not a pass. Route it to a person.
      (checks.get(sentenceId) as Check[]).push({
        ...check,
        verdict: "ambiguous",
        confidence: 0,
        reason: "the judge returned no answer for this cite",
      });
      continue;
    }
    (checks.get(sentenceId) as Check[]).push({
      ...check,
      verdict: RELATION_VERDICT[answer.choice],
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      reason: (premise ? PREMISE_REASON : RELATION_REASON)[answer.choice],
    });
  }

  return sentences.map((sentence) => {
    const out = checks.get(sentence.id) as Check[];
    const kind = kinds.get(sentence.id);
    const assertsFact = (kind?.assertsFact ?? 0) >= options.kindThreshold;
    const statesLaw = (kind?.statesLaw ?? 0) >= options.kindThreshold;

    let effectiveKind: SentenceKind = sentence.kind;
    if (sentence.kind === "argument" && assertsFact) effectiveKind = "fact";
    else if (sentence.kind === "argument" && statesLaw) effectiveKind = "law";

    // An application sentence with cites had its premises checked, not its conclusion. Whether
    // the conclusion follows is legal reasoning, so it always goes to a person. Marking it
    // verified would claim more than was checked.
    const cited = sentence.recordCites.length + sentence.authorityCites.length > 0;
    if (sentence.kind === "argument" && cited) {
      out.push({
        target: "sentence",
        citeIndex: null,
        verdict: "ambiguous",
        stage: "code",
        confidence: null,
        reason:
          "Its premises were checked against the cited passages. Whether the conclusion follows from them is a legal judgment, so it is yours.",
      });
    }

    // Declared fact or law with nothing behind it: blocked, no model involved.
    if (sentence.kind === "fact" && sentence.recordCites.length === 0) {
      out.push(uncited("a sentence declared as fact carries no record cite", "code"));
    }
    if (sentence.kind === "law" && sentence.authorityCites.length === 0) {
      out.push(uncited("a sentence declared as law carries no authority", "code"));
    }
    // Declared argument, but the judge reads a fact or a rule in it. The drafter may be right, so
    // this goes to a person rather than blocking, which keeps classifier noise out of the gate.
    if (sentence.kind === "argument" && assertsFact && sentence.recordCites.length === 0) {
      out.push({
        ...uncited(
          "declared as argument, but it reads as asserting a fact and cites no record",
          "jev",
        ),
        verdict: "ambiguous",
        confidence: kind?.assertsFact ?? null,
      });
    }
    if (sentence.kind === "argument" && statesLaw && sentence.authorityCites.length === 0) {
      out.push({
        ...uncited(
          "declared as argument, but it reads as stating a rule and cites no authority",
          "jev",
        ),
        verdict: "ambiguous",
        confidence: kind?.statesLaw ?? null,
      });
    }

    return {
      sentenceId: sentence.id,
      declaredKind: sentence.kind,
      effectiveKind,
      status: statusOf(out, options.confidenceThreshold),
      checks: out,
    };
  });
}

function uncited(reason: string, stage: Check["stage"]): Check {
  return {
    target: "sentence",
    citeIndex: null,
    verdict: "uncited",
    stage,
    confidence: null,
    reason,
  };
}

export function statusOf(checks: Check[], threshold: number): SentenceStatus {
  if (checks.length === 0) return "exempt";

  const confident = (check: Check) =>
    check.stage === "code" || (check.confidence ?? 0) >= threshold;

  if (checks.some((check) => BLOCKING.has(check.verdict) && confident(check))) return "blocked";
  if (checks.some((check) => check.verdict === "ambiguous" || !confident(check))) return "review";
  return "verified";
}
