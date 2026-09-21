import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServer } from "./lib";
import schema, { authorityCite, lane, recordCite, sentenceKind, verification } from "./schema";

const ZERO_USAGE = {
  drafterInputTokens: 0,
  drafterOutputTokens: 0,
  judgeInputTokens: 0,
  judgeRequests: 0,
  costUsd: 0,
  durationMs: 0,
};

export const create = mutation({
  args: { secret: v.string(), matterId: v.string(), lane, sessionId: v.optional(v.string()) },
  returns: v.id("drafts"),
  handler: async (ctx, { secret, ...draft }) => {
    assertServer(secret);
    return await ctx.db.insert("drafts", {
      ...draft,
      status: "drafting",
      stage: "starting",
      featured: false,
      usage: ZERO_USAGE,
    });
  },
});

/** Replaces a section's sentences. Rewriting a section discards its old verifications with it. */
export const writeSection = mutation({
  args: {
    secret: v.string(),
    draftId: v.id("drafts"),
    sectionId: v.string(),
    sectionOrder: v.number(),
    sentences: v.array(
      v.object({
        text: v.string(),
        kind: sentenceKind,
        recordCites: v.array(recordCite),
        authorityCites: v.array(authorityCite),
      }),
    ),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { secret, draftId, sectionId, sectionOrder, sentences }) => {
    assertServer(secret);
    const draft = await ctx.db.get("drafts", draftId);
    if (!draft) throw new ConvexError("no such draft");
    if (draft.status === "signed") throw new ConvexError("a signed draft cannot be changed");

    const existing = ctx.db
      .query("sentences")
      .withIndex("by_draftId_and_order", (q) => q.eq("draftId", draftId));
    for await (const row of existing) {
      if (row.sectionId === sectionId) await ctx.db.delete("sentences", row._id);
    }

    const ids: string[] = [];
    for (const [i, sentence] of sentences.entries()) {
      const sentenceId = `${sectionId}-${i + 1}`;
      ids.push(sentenceId);
      await ctx.db.insert("sentences", {
        draftId,
        sectionId,
        order: sectionOrder * 1000 + i,
        sentenceId,
        verification: null,
        ...sentence,
      });
    }
    // Anything written after verification puts the draft back behind the gate.
    await ctx.db.patch("drafts", draftId, { status: "drafting" });
    return ids;
  },
});

export const recordVerifications = mutation({
  args: {
    secret: v.string(),
    draftId: v.id("drafts"),
    results: v.array(v.object({ sentenceId: v.string(), verification })),
  },
  returns: v.null(),
  handler: async (ctx, { secret, draftId, results }) => {
    assertServer(secret);
    for (const result of results) {
      const row = await ctx.db
        .query("sentences")
        .withIndex("by_draftId_and_sentenceId", (q) =>
          q.eq("draftId", draftId).eq("sentenceId", result.sentenceId),
        )
        .unique();
      if (row) await ctx.db.patch("sentences", row._id, { verification: result.verification });
    }
    return null;
  },
});

export const update = mutation({
  args: {
    secret: v.string(),
    draftId: v.id("drafts"),
    status: v.optional(schema.doc("drafts").fields.status),
    stage: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    usage: v.optional(schema.doc("drafts").fields.usage),
  },
  returns: v.null(),
  handler: async (ctx, { secret, draftId, ...patch }) => {
    assertServer(secret);
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch("drafts", draftId, changes);
    return null;
  },
});

/** An attorney's decision on one sentence. The latest decision for a sentence wins. */
export const adjudicate = mutation({
  args: {
    secret: v.string(),
    draftId: v.id("drafts"),
    sentenceId: v.string(),
    decision: v.union(v.literal("accept"), v.literal("strike")),
    by: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...args }) => {
    assertServer(secret);
    const sentence = await ctx.db
      .query("sentences")
      .withIndex("by_draftId_and_sentenceId", (q) =>
        q.eq("draftId", args.draftId).eq("sentenceId", args.sentenceId),
      )
      .unique();
    if (!sentence) throw new ConvexError("no such sentence");

    const previous = await ctx.db
      .query("adjudications")
      .withIndex("by_draftId_and_sentenceId", (q) =>
        q.eq("draftId", args.draftId).eq("sentenceId", args.sentenceId),
      )
      .take(20);
    for (const row of previous) await ctx.db.delete("adjudications", row._id);

    await ctx.db.insert("adjudications", {
      ...args,
      sentenceText: sentence.text,
      machineStatus: sentence.verification?.status ?? "unverified",
      machineVerdicts: sentence.verification?.checks.map((c) => c.verdict) ?? [],
    });
    return null;
  },
});

/**
 * Signs a draft. The gate is re-evaluated here, inside the transaction, against what is actually
 * stored: whatever the caller believed about the draft a moment ago does not matter.
 */
export const sign = mutation({
  args: { secret: v.string(), draftId: v.id("drafts"), by: v.string() },
  returns: v.union(
    v.object({ signed: v.literal(true) }),
    v.object({ signed: v.literal(false), open: v.array(v.string()) }),
  ),
  handler: async (ctx, { secret, draftId, by }) => {
    assertServer(secret);
    const sentences = await ctx.db
      .query("sentences")
      .withIndex("by_draftId_and_order", (q) => q.eq("draftId", draftId))
      .take(1000);
    if (sentences.length === 0) throw new ConvexError("an empty draft cannot be signed");

    const decided = new Set(
      (
        await ctx.db
          .query("adjudications")
          .withIndex("by_draftId_and_sentenceId", (q) => q.eq("draftId", draftId))
          .take(1000)
      ).map((row) => row.sentenceId),
    );
    const open = sentences
      .filter((s) => !decided.has(s.sentenceId))
      .filter((s) => s.verification?.status !== "verified" && s.verification?.status !== "exempt")
      .map((s) => s.sentenceId);

    if (open.length > 0) return { signed: false as const, open };
    await ctx.db.patch("drafts", draftId, { status: "signed", signedBy: by, signedAt: Date.now() });
    return { signed: true as const };
  },
});

export const logEvent = mutation({
  args: {
    secret: v.string(),
    draftId: v.id("drafts"),
    type: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...event }) => {
    assertServer(secret);
    await ctx.db.insert("events", event);
    return null;
  },
});

export const get = query({
  args: { draftId: v.id("drafts") },
  returns: v.union(
    v.null(),
    v.object({
      draft: schema.doc("drafts"),
      sentences: v.array(schema.doc("sentences")),
      adjudications: v.array(schema.doc("adjudications")),
      events: v.array(schema.doc("events")),
    }),
  ),
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get("drafts", draftId);
    if (!draft) return null;
    return {
      draft,
      sentences: await ctx.db
        .query("sentences")
        .withIndex("by_draftId_and_order", (q) => q.eq("draftId", draftId))
        .take(1000),
      adjudications: await ctx.db
        .query("adjudications")
        .withIndex("by_draftId_and_sentenceId", (q) => q.eq("draftId", draftId))
        .take(1000),
      events: await ctx.db
        .query("events")
        .withIndex("by_draftId", (q) => q.eq("draftId", draftId))
        .take(1000),
    };
  },
});

export const featured = query({
  args: { lane },
  returns: v.union(v.null(), v.id("drafts")),
  handler: async (ctx, args) => {
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_featured_and_lane", (q) => q.eq("featured", true).eq("lane", args.lane))
      .order("desc")
      .first();
    return draft?._id ?? null;
  },
});
