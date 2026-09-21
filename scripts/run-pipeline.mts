// Runs the deterministic lane once from the command line.
//   pnpm pipeline              Jev selects, Gemini writes the application sentences
//   pnpm pipeline -- --jev     no generative model at all
import { getBackend } from "../src/lib/drafting/backend";
import { runPipeline } from "../src/lib/pipeline/run";

const generative = !process.argv.includes("--jev");
const { draftId, summary, origins } = await runPipeline(getBackend(), undefined, { generative });
console.log(
  JSON.stringify(
    {
      draftId,
      generative,
      origins,
      counts: summary.counts,
      gateOpen: summary.gate.open,
      problems: summary.problems,
    },
    null,
    2,
  ),
);
