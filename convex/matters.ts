import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertServer } from "./lib";
import schema from "./schema";

const matterFields = schema.doc("matters").fields;

export const upsert = mutation({
  args: {
    secret: v.string(),
    matterId: v.string(),
    caption: v.string(),
    court: v.string(),
    docketNumber: v.optional(v.string()),
    motionTitle: v.string(),
    motion: v.string(),
    task: matterFields.task,
    prepared: v.boolean(),
    url: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { secret, ...matter }) => {
    assertServer(secret);
    const existing = await ctx.db
      .query("matters")
      .withIndex("by_matterId", (q) => q.eq("matterId", matter.matterId))
      .unique();
    if (existing) await ctx.db.replace("matters", existing._id, matter);
    else await ctx.db.insert("matters", matter);
    return null;
  },
});

export const get = query({
  args: { matterId: v.string() },
  returns: v.union(v.null(), schema.doc("matters")),
  handler: async (ctx, { matterId }) => {
    return await ctx.db
      .query("matters")
      .withIndex("by_matterId", (q) => q.eq("matterId", matterId))
      .unique();
  },
});

/** The cases everyone can pick: the prepared ones, plus any the browser asks for by id. */
export const list = query({
  args: { ids: v.array(v.string()) },
  returns: v.array(schema.doc("matters")),
  handler: async (ctx, { ids }) => {
    const prepared = (await ctx.db.query("matters").take(200)).filter((m) => m.prepared);
    const own = (
      await Promise.all(
        ids.slice(0, 50).map((matterId) =>
          ctx.db
            .query("matters")
            .withIndex("by_matterId", (q) => q.eq("matterId", matterId))
            .unique(),
        ),
      )
    ).filter((m): m is NonNullable<typeof m> => m !== null && !m.prepared);
    return [...prepared, ...own];
  },
});
