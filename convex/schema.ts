import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const passage = v.object({ index: v.number(), section: v.string(), text: v.string() });

export const recordCite = v.object({ docId: v.string(), quote: v.string() });
export const authorityCite = v.object({
  citation: v.string(),
  caseName: v.string(),
  quote: v.string(),
});

export const sentenceKind = v.union(v.literal("fact"), v.literal("law"), v.literal("argument"));

export const check = v.object({
  target: v.union(v.literal("record"), v.literal("authority"), v.literal("sentence")),
  citeIndex: v.union(v.number(), v.null()),
  verdict: v.string(),
  stage: v.union(v.literal("code"), v.literal("jev")),
  confidence: v.union(v.number(), v.null()),
  probabilities: v.optional(v.record(v.string(), v.number())),
  evidence: v.optional(
    v.object({
      sourceId: v.string(),
      sourceTitle: v.string(),
      section: v.string(),
      passage: v.string(),
      url: v.optional(v.string()),
    }),
  ),
  reason: v.string(),
});

export const verification = v.object({
  status: v.union(
    v.literal("verified"),
    v.literal("blocked"),
    v.literal("review"),
    v.literal("exempt"),
  ),
  effectiveKind: sentenceKind,
  checks: v.array(check),
});

export const lane = v.union(v.literal("agentic"), v.literal("pipeline"));

export default defineSchema({
  // One row per record document or authority. Passages live in their own table so search can
  // return the paragraph that matters instead of a whole deposition.
  // A case the workspace can draft for: the prepared one, and any a person attaches.
  matters: defineTable({
    matterId: v.string(),
    caption: v.string(),
    court: v.string(),
    docketNumber: v.optional(v.string()),
    motionTitle: v.string(),
    /** What the motion asks for, in one sentence. Drives what the judge selects for. */
    motion: v.string(),
    task: v.object({
      elements: v.array(v.object({ id: v.string(), label: v.string(), need: v.string() })),
      rules: v.array(v.object({ id: v.string(), rule: v.string(), query: v.string() })),
    }),
    prepared: v.boolean(),
    url: v.optional(v.string()),
  }).index("by_matterId", ["matterId"]),

  sources: defineTable({
    matterId: v.string(),
    kind: v.union(v.literal("record"), v.literal("authority")),
    sourceId: v.string(),
    title: v.string(),
    docKind: v.string(),
    notice: v.union(v.string(), v.null()),
    citation: v.optional(v.string()),
    url: v.optional(v.string()),
    passageCount: v.number(),
  })
    .index("by_matterId_and_kind", ["matterId", "kind"])
    .index("by_matterId_and_sourceId", ["matterId", "sourceId"]),

  passages: defineTable({
    matterId: v.string(),
    kind: v.union(v.literal("record"), v.literal("authority")),
    sourceId: v.string(),
    sourceTitle: v.string(),
    index: v.number(),
    section: v.string(),
    text: v.string(),
  })
    .index("by_matterId_and_sourceId_and_index", ["matterId", "sourceId", "index"])
    .searchIndex("search_text", { searchField: "text", filterFields: ["matterId", "kind"] }),

  drafts: defineTable({
    matterId: v.string(),
    lane,
    status: v.union(
      v.literal("drafting"),
      v.literal("verifying"),
      v.literal("gated"),
      v.literal("signed"),
      v.literal("failed"),
    ),
    stage: v.string(),
    sessionId: v.optional(v.string()),
    signedBy: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    /** A finished run kept for the zero-cost "watch a recorded run" view. */
    featured: v.boolean(),
    usage: v.object({
      drafterInputTokens: v.number(),
      drafterOutputTokens: v.number(),
      judgeInputTokens: v.number(),
      judgeRequests: v.number(),
      costUsd: v.number(),
      durationMs: v.number(),
    }),
  })
    .index("by_matterId_and_lane", ["matterId", "lane"])
    .index("by_featured_and_lane", ["featured", "lane"])
    .index("by_sessionId", ["sessionId"])
    .index("by_status_and_signedAt", ["status", "signedAt"]),

  sentences: defineTable({
    draftId: v.id("drafts"),
    sectionId: v.string(),
    order: v.number(),
    sentenceId: v.string(),
    text: v.string(),
    kind: sentenceKind,
    recordCites: v.array(recordCite),
    authorityCites: v.array(authorityCite),
    /** selected: code assembled it from a passage Jev chose. written: a generative model wrote it. */
    origin: v.optional(v.union(v.literal("selected"), v.literal("written"))),
    verification: v.union(verification, v.null()),
  })
    .index("by_draftId_and_order", ["draftId", "order"])
    .index("by_draftId_and_sentenceId", ["draftId", "sentenceId"]),

  // An attorney's decision on a sentence. The snapshot of what was decided makes each row a
  // ready-made test-set label: this sentence, this evidence, this human verdict.
  adjudications: defineTable({
    draftId: v.id("drafts"),
    sentenceId: v.string(),
    decision: v.union(v.literal("accept"), v.literal("strike")),
    by: v.string(),
    reason: v.string(),
    sentenceText: v.string(),
    machineStatus: v.string(),
    machineVerdicts: v.array(v.string()),
  }).index("by_draftId_and_sentenceId", ["draftId", "sentenceId"]),

  events: defineTable({
    draftId: v.id("drafts"),
    type: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
  }).index("by_draftId", ["draftId"]),
});
