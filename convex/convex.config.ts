import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    // Held only by server code. See convex/lib.ts.
    SERVER_SECRET: v.optional(v.string()),
  },
});
app.use(rateLimiter);

export default app;
