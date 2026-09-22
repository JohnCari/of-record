import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { assertServer } from "./lib";

// One shared bucket for the whole demo. Each pipeline run costs real money, and the link may be
// forwarded, so the ceiling is global rather than per visitor.
const limiter = new RateLimiter(components.rateLimiter, {
  pipelineRun: { kind: "fixed window", rate: 40, period: DAY },
  // Attaching a case stores files and calls the writer once, so it has a daily ceiling too.
  attachCase: { kind: "fixed window", rate: 20, period: DAY },
});

export const takePipelineRun = mutation({
  args: { secret: v.string() },
  returns: v.object({ ok: v.boolean(), retryAfterMs: v.union(v.number(), v.null()) }),
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const { ok, retryAfter } = await limiter.limit(ctx, "pipelineRun");
    return { ok, retryAfterMs: retryAfter ?? null };
  },
});

export const takeAttachCase = mutation({
  args: { secret: v.string() },
  returns: v.object({ ok: v.boolean(), retryAfterMs: v.union(v.number(), v.null()) }),
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    const { ok, retryAfter } = await limiter.limit(ctx, "attachCase");
    return { ok, retryAfterMs: retryAfter ?? null };
  },
});
