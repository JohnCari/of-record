import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
        origin: v.optional(v.union(v.literal("selected"), v.literal("written"))),
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
  args: { matterId: v.string(), lane },
  returns: v.union(v.null(), v.id("drafts")),
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query("drafts")
      .withIndex("by_matterId_and_lane", (q) =>
        q.eq("matterId", args.matterId).eq("lane", args.lane),
      )
      .order("desc")
      .take(100);
    return recent.find((draft) => draft.featured)?._id ?? null;
  },
});

/** The most recent finished draft for a case, so switching back to it can show the last one. */
export const latest = query({
  args: { matterId: v.string(), lane },
  returns: v.union(v.null(), v.id("drafts")),
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query("drafts")
      .withIndex("by_matterId_and_lane", (q) =>
        q.eq("matterId", args.matterId).eq("lane", args.lane),
      )
      .order("desc")
      .take(50);
    return (
      recent.find((d) => d.featured)?._id ??
      recent.find((d) => d.status === "gated" || d.status === "signed")?._id ??
      null
    );
  },
});

/** The browser knows its eve session id before it knows the draft the agent created for it. */
export const bySession = query({
  args: { sessionId: v.string() },
  returns: v.union(v.null(), v.id("drafts")),
  handler: async (ctx, { sessionId }) => {
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .first();
    return draft?._id ?? null;
  },
});

/** Deletes one draft of a matter with everything attached to it. The caller loops until none remain. */
export const purgeOne = mutation({
  args: { secret: v.string(), matterId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { secret, matterId }) => {
    assertServer(secret);
    for (const draftLane of ["agentic", "pipeline"] as const) {
      const draft = await ctx.db
        .query("drafts")
        .withIndex("by_matterId_and_lane", (q) => q.eq("matterId", matterId).eq("lane", draftLane))
        .first();
      if (!draft) continue;
      for (const table of ["sentences", "adjudications", "events"] as const) {
        const index =
          table === "sentences"
            ? "by_draftId_and_order"
            : table === "events"
              ? "by_draftId"
              : "by_draftId_and_sentenceId";
        const rows = await ctx.db
          .query(table)
          // biome-ignore lint/suspicious/noExplicitAny: the three tables share a draftId prefix on differently named indexes
          .withIndex(index as any, (q: any) => q.eq("draftId", draft._id))
          .take(2000);
        for (const row of rows) await ctx.db.delete(table, row._id);
      }
      await ctx.db.delete("drafts", draft._id);
      return true;
    }
    return false;
  },
});

const signedRow = v.object({
  draftId: v.id("drafts"),
  matterId: v.string(),
  caption: v.string(),
  motionTitle: v.string(),
  signedAt: v.number(),
  sentences: v.number(),
  verified: v.number(),
  accepted: v.number(),
  struck: v.number(),
  costUsd: v.number(),
});

const SIGNED_ROWS = 20;

/**
 * Signed drafts the viewer may see, newest first: every prepared case's, plus those of the cases this
 * browser attached. Attached cases are private to the browser that holds their ids, as in matters.list.
 */
export const listSigned = query({
  args: { ownIds: v.array(v.string()) },
  returns: v.array(signedRow),
  handler: async (ctx, { ownIds }) => {
    const own = new Set(ownIds.slice(0, 50));
    const signed = await ctx.db
      .query("drafts")
      .withIndex("by_status_and_signedAt", (q) => q.eq("status", "signed"))
      .order("desc")
      .take(100);
    const matters = new Map<string, Doc<"matters"> | null>();
    const rows = [];
    for (const draft of signed) {
      if (rows.length >= SIGNED_ROWS) break;
      let matter = matters.get(draft.matterId);
      if (matter === undefined) {
        matter = await ctx.db
          .query("matters")
          .withIndex("by_matterId", (q) => q.eq("matterId", draft.matterId))
          .unique();
        matters.set(draft.matterId, matter);
      }
      if (!matter || !(matter.prepared || own.has(matter.matterId))) continue;

      const sentences = await ctx.db
        .query("sentences")
        .withIndex("by_draftId_and_order", (q) => q.eq("draftId", draft._id))
        .take(1000);
      const decided = new Map(
        (
          await ctx.db
            .query("adjudications")
            .withIndex("by_draftId_and_sentenceId", (q) => q.eq("draftId", draft._id))
            .take(1000)
        ).map((a) => [a.sentenceId, a.decision]),
      );
      // The attorney's decision counts over the machine's, as it does on the page.
      let verified = 0;
      let accepted = 0;
      let struck = 0;
      for (const s of sentences) {
        const decision = decided.get(s.sentenceId);
        if (decision === "accept") accepted += 1;
        else if (decision === "strike") struck += 1;
        else if (s.verification?.status === "verified") verified += 1;
      }
      rows.push({
        draftId: draft._id,
        matterId: draft.matterId,
        caption: matter.caption,
        motionTitle: matter.motionTitle,
        signedAt: draft.signedAt ?? draft._creationTime,
        sentences: sentences.length,
        verified,
        accepted,
        struck,
        costUsd: draft.usage.costUsd,
      });
    }
    return rows;
  },
});
