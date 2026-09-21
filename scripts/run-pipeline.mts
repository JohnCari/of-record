// Runs the deterministic lane once from the command line.
//   pnpm pipeline
import { getBackend } from "../src/lib/drafting/backend";
import { runPipeline } from "../src/lib/pipeline/run";

const { draftId, summary } = await runPipeline(getBackend());
console.log(
  JSON.stringify(
    { draftId, counts: summary.counts, gateOpen: summary.gate.open, problems: summary.problems },
    null,
    2,
  ),
);
