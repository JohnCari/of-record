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

export const MATTER_ID = "cottonwood-v-tumbleweed";

export const SECTIONS = [
  { id: "facts", title: "Statement of Undisputed Material Facts" },
  { id: "standard", title: "Summary Judgment Standard" },
  { id: "argument", title: "Argument" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

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
  problems: { sentenceId: string; status: string; text: string; reasons: string[] }[];
  judge: Judge["usage"];
};

/**
 * Verifies every sentence of a draft, stores the results, and evaluates the gate. Both lanes end
 * here, so neither can be checked more leniently than the other.
 */
export async function validateDraft(
  backend: Backend,
  draftId: Id<"drafts">,
  signal?: AbortSignal,
): Promise<ValidationSummary> {
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

  const judge = createJevJudge();
  const verifications = await verifySentences(
    sentences,
    { record: convexRecordStore(backend), authorities: await authorityResolver(backend), judge },
    { ...DEFAULT_OPTIONS, signal },
  );

  await convex.mutation(api.drafts.recordVerifications, {
    secret,
    draftId,
    results: verifications.map((v) => ({
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
      })),
    judge: judge.usage,
  };
}
