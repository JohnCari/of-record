import { defineAgent } from "eve";

export default defineAgent({
  // The drafter. It writes; it does not decide whether what it wrote is true. Jev does that, in
  // the verifier, through the same AI Gateway.
  model: "google/gemini-3.8-flash",
  reasoning: "low",

  // No shell, no file system, no web. The agent gets the eight tools in agent/tools and nothing else.
  defaultTools: false,

  limits: {
    // A public demo URL must not be an open wallet. The gateway key has its own hard budget too.
    maxTokenCostUsdPerSession: 0.75,
    maxOutputTokensPerSession: 80_000,
    sessionTimeoutMs: 24 * 60 * 60 * 1000,
  },
});
