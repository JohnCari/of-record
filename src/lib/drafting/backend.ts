import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createCourtListener } from "../courtlistener/client";
import { courtListenerResolver } from "../courtlistener/resolver";
import { evaluateGate, type GateResult } from "../verify/gate";
import { createJevJudge, type Judge } from "../verify/judge";
import type { Authority, AuthorityResolver, RecordStore } from "../verify/sources";
import type { DraftSentence, SentenceVerification } from "../verify/types";
import { DEFAULT_OPTIONS, verifySentences } from "../verify/verify";
import { MATTER_ID } from "./sections";

export { MATTER_ID, SECTIONS, type SectionId } from "./sections";

export type Backend = { convex: ConvexHttpClient; secret: string };

export function getBackend(): Backend {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.SERVER_SECRET;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_CONVEX_URL and SERVER_SECRET must be set");
  return { convex: new ConvexHttpClient(url), secret };
}

export function convexRecordStore({ convex }: Backend, matterId = MATTER_ID): RecordStore {
  const cache = new Map<string, ReturnType<RecordStore["get"]>>();
  return {
    get(docId) {
      if (!cache.has(docId)) {
        cache.set(
          docId,
          convex.query(api.knowledge.getSource, { matterId, sourceId: docId }).then((source) =>
            // Only record documents can back a fact. An authority id here is a fabricated exhibit.
            source && source.kind === "record"
              ? { id: source.sourceId, title: source.title, passages: source.passages }
              : null,
          ),
        );
      }
      return cache.get(docId) as ReturnType<RecordStore["get"]>;
    },
  };
}

export async function authorityResolver(
  { convex }: Backend,
  matterId = MATTER_ID,
): Promise<AuthorityResolver> {
  const seeded = await convex.query(api.knowledge.listSources, { matterId, kind: "authority" });
  const corpus: Authority[] = [];
  for (const source of seeded) {
    const full = await convex.query(api.knowledge.getSource, {
      matterId,
      sourceId: source.sourceId,
    });
    if (!full?.citation) continue;
    corpus.push({
      id: full.sourceId,
      caseName: full.title,
      citation: full.citation,
      url: full.url ?? "",
      passages: full.passages,
    });
  }
  const token = process.env.COURTLISTENER_TOKEN || undefined;
  return courtListenerResolver(createCourtListener({ token }), corpus);
}

export type ValidationSummary = {
  gate: GateResult;
  counts: Record<SentenceVerification["status"], number>;
  problems: {
    sentenceId: string;
    status: string;
    text: string;
    reasons: string[];
    /**
     * True for an application sentence whose premises all checked out. Nothing is wrong with it;
     * its conclusion is waiting for the attorney. A drafter must not try to "fix" it.
     */
    attorneyOnly: boolean;
  }[];
  judge: Judge["usage"];
};

/**
 * Verifies every sentence of a draft, stores the results, and evaluates the gate. Both lanes end
 * here, so neither can be checked more leniently than the other.
 */
export async function validateDraft(
  backend: Backend,
  draftId: Id<"drafts">,
  options: { signal?: AbortSignal; full?: boolean } = {},
): Promise<ValidationSummary> {
  const { signal, full = false } = options;
  const { convex, secret } = backend;
  const state = await convex.query(api.drafts.get, { draftId });
  if (!state) throw new Error("no such draft");

  await convex.mutation(api.drafts.update, {
    secret,
    draftId,
    status: "verifying",
    stage: "verifying",
  });

  const sentences: DraftSentence[] = state.sentences.map((row) => ({
    id: row.sentenceId,
    text: row.text,
    kind: row.kind,
    recordCites: row.recordCites,
    authorityCites: row.authorityCites,
  }));

  // Rewriting a section clears the verification of its sentences and of no others. Unless a full
  // pass is asked for, only those are checked again: an unchanged sentence against an unchanged
  // record gets the same answer, and re-asking costs the attorney time. Sign-off always asks for
  // a full pass.
  const kept = new Map<string, SentenceVerification>();
  if (!full) {
    for (const row of state.sentences) {
      if (!row.verification) continue;
      kept.set(row.sentenceId, {
        sentenceId: row.sentenceId,
        declaredKind: row.kind,
        effectiveKind: row.verification.effectiveKind,
        status: row.verification.status,
        checks: row.verification.checks as SentenceVerification["checks"],
      });
    }
  }
  const pending = sentences.filter((s) => !kept.has(s.id));

  const judge = createJevJudge();
  const fresh =
    pending.length === 0
      ? []
      : await verifySentences(
          pending,
          {
            record: convexRecordStore(backend),
            authorities: await authorityResolver(backend),
            judge,
          },
          { ...DEFAULT_OPTIONS, signal },
        );
  const freshById = new Map(fresh.map((v) => [v.sentenceId, v]));
  const verifications = sentences.map(
    (s) => (freshById.get(s.id) ?? kept.get(s.id)) as SentenceVerification,
  );

  await convex.mutation(api.drafts.recordVerifications, {
    secret,
    draftId,
    results: fresh.map((v) => ({
      sentenceId: v.sentenceId,
      verification: { status: v.status, effectiveKind: v.effectiveKind, checks: v.checks },
    })),
  });

  const gate = evaluateGate(
    sentences.map((s) => s.id),
    verifications,
    state.adjudications.map((a) => ({
      sentenceId: a.sentenceId,
      decision: a.decision,
      by: a.by,
      reason: a.reason,
    })),
  );
  await convex.mutation(api.drafts.update, {
    secret,
    draftId,
    status: "gated",
    stage: gate.open ? "ready for attorney sign-off" : "held at the gate",
  });

  const counts = { verified: 0, blocked: 0, review: 0, exempt: 0 };
  for (const v of verifications) counts[v.status] += 1;
  const text = new Map(sentences.map((s) => [s.id, s.text]));

  return {
    gate,
    counts,
    problems: verifications
      .filter((v) => v.status === "blocked" || v.status === "review")
      .map((v) => ({
        sentenceId: v.sentenceId,
        status: v.status,
        text: text.get(v.sentenceId) ?? "",
        reasons: v.checks
          .filter((c) => c.verdict !== "verified")
          .map((c) => `${c.verdict}: ${c.reason}`),
        attorneyOnly:
          v.declaredKind === "argument" &&
          v.checks.every(
            (c) =>
              c.verdict === "verified" ||
              (c.target === "sentence" && c.stage === "code" && c.verdict === "ambiguous"),
          ),
      })),
    judge: judge.usage,
  };
}
