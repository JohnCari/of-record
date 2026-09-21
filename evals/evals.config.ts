import { defineEvalConfig } from "eve/evals";

// Every assertion here is deterministic: tool calls, and what is stored after the run. No judge
// model grades these, because the guarantees under test are not matters of opinion.
export default defineEvalConfig({ timeoutMs: 240_000, maxConcurrency: 2 });
