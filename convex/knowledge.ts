import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServer } from "./lib";
import schema, { passage } from "./schema";

const sourceKind = v.union(v.literal("record"), v.literal("authority"));

/** Replaces one source and its passages. Idempotent, so the seed script can be re-run safely. */
export const upsertSource = mutation({
  args: {
    secret: v.string(),
    matterId: v.string(),
    kind: sourceKind,
    sourceId: v.string(),
    title: v.string(),
    docKind: v.string(),
    notice: v.union(v.string(), v.null()),
    citation: v.optional(v.string()),
    url: v.optional(v.string()),
    passages: v.array(passage),
  },
  returns: v.null(),
  handler: async (ctx, { secret, passages, ...source }) => {
    assertServer(secret);

    const existing = await ctx.db
      .query("sources")
      .withIndex("by_matterId_and_sourceId", (q) =>
        q.eq("matterId", source.matterId).eq("sourceId", source.sourceId),
      )
      .unique();
    if (existing) await ctx.db.delete("sources", existing._id);

    const old = ctx.db
      .query("passages")
      .withIndex("by_matterId_and_sourceId_and_index", (q) =>
        q.eq("matterId", source.matterId).eq("sourceId", source.sourceId),
      );
    for await (const row of old) await ctx.db.delete("passages", row._id);

    await ctx.db.insert("sources", { ...source, passageCount: passages.length });
    for (const item of passages) {
      await ctx.db.insert("passages", {
        matterId: source.matterId,
        kind: source.kind,
        sourceId: source.sourceId,
        sourceTitle: source.title,
        ...item,
      });
    }
    return null;
  },
});

export const listSources = query({
  args: { matterId: v.string(), kind: sourceKind },
  returns: v.array(schema.doc("sources")),
  handler: async (ctx, { matterId, kind }) => {
    return await ctx.db
      .query("sources")
      .withIndex("by_matterId_and_kind", (q) => q.eq("matterId", matterId).eq("kind", kind))
      .take(200);
  },
});

export const getSource = query({
  args: { matterId: v.string(), sourceId: v.string() },
  returns: v.union(
    v.null(),
    schema.doc("sources").extend({ passages: v.array(schema.doc("passages")) }),
  ),
  handler: async (ctx, { matterId, sourceId }) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_matterId_and_sourceId", (q) =>
        q.eq("matterId", matterId).eq("sourceId", sourceId),
      )
      .unique();
    if (!source) return null;
    const passages = await ctx.db
      .query("passages")
      .withIndex("by_matterId_and_sourceId_and_index", (q) =>
        q.eq("matterId", matterId).eq("sourceId", sourceId),
      )
      .take(2000);
    return { ...source, passages };
  },
});

/** Lexical recall. The caller reranks with Jev; BM25 alone puts topical noise above the rule. */
export const search = query({
  args: { matterId: v.string(), kind: sourceKind, text: v.string(), limit: v.optional(v.number()) },
  returns: v.array(schema.doc("passages")),
  handler: async (ctx, { matterId, kind, text, limit }) => {
    return await ctx.db
      .query("passages")
      .withSearchIndex("search_text", (q) =>
        q.search("text", text).eq("matterId", matterId).eq("kind", kind),
      )
      .take(Math.min(limit ?? 20, 40));
  },
});
