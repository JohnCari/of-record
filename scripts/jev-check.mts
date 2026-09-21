// Ten-second check that Jev answers through the Vercel AI Gateway.   pnpm jev:check
import { experimental_evaluate as evaluate } from "ai";

const started = Date.now();
try {
  const result = await evaluate({
    model: "typesafe-ai/jev",
    maxRetries: 0,
    state: {
      passage:
        "Escrow Holder shall disburse Cash Funds on written instructions signed by both Granite and Alberta.",
    },
    questions: {
      both: {
        type: "choice",
        instructions:
          "How does `passage` relate to the claim that the funds may be released on one party's instruction alone?",
        criteria: {
          supports: "It says so",
          contradicts: "It says the opposite",
          says_nothing: "It does not address it",
        },
      },
    },
  });
  const answer = result.answers.both as { choice: string; probabilities?: Record<string, number> };
  console.log(
    `ok in ${Date.now() - started} ms: ${answer.choice} ${JSON.stringify(answer.probabilities)} via ${result.response.modelId}`,
  );
} catch (error) {
  const e = error as { statusCode?: number; message?: string };
  console.log(
    `FAILED in ${Date.now() - started} ms: ${e.statusCode ?? ""} ${e.message?.slice(0, 160)}`,
  );
  process.exit(1);
}
