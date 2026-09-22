import { experimental_evaluate as evaluate } from "ai";
import { inParts, withRetry } from "./retry";

export type Relation = "supports" | "contradicts" | "says_nothing";

export type SupportQuestion = {
  id: string;
  /**
   * fact: does the record passage establish this? law: does the opinion state this rule?
   * premise: does the passage establish something this application sentence relies on? The
   * sentence's conclusion is deliberately not asked about; that is the attorney's judgment.
   */
  mode: "fact" | "law" | "premise";
  claim: string;
  passage: string;
};

export type SupportAnswer = {
  choice: Relation;
  probabilities: Record<Relation, number>;
  confidence: number;
};

export type KindAnswer = { assertsFact: number; statesLaw: number };

export type JudgeUsage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

/**
 * The only model-backed dependency of the verifier. It answers closed questions and nothing else:
 * there is no free-text channel through which it could introduce a fact or a citation.
 */
export interface Judge {
  support(questions: SupportQuestion[], signal?: AbortSignal): Promise<Map<string, SupportAnswer>>;
  classify(
    sentences: { id: string; text: string }[],
    signal?: AbortSignal,
  ): Promise<Map<string, KindAnswer>>;
  /** Probability that each passage answers the query. Used to rerank lexical search results. */
  relevance(
    query: string,
    passages: { id: string; text: string }[],
    signal?: AbortSignal,
  ): Promise<Map<string, number>>;
  readonly usage: JudgeUsage;
}

const SUPPORT_CRITERIA: Record<SupportQuestion["mode"], Record<Relation, string>> = {
  fact: {
    supports: "The passage states the claim or directly implies that it is true",
    contradicts: "The passage states the opposite of the claim or implies that it is false",
    says_nothing: "The passage does not address what the claim asserts, either way",
  },
  law: {
    supports: "The passage states this rule or holding as the law the court applies",
    contradicts:
      "The passage rejects this rule, states the opposite rule, or states it only as a party's argument or a dissenting view",
    says_nothing: "The passage concerns a similar topic but does not state this rule or holding",
  },
  premise: {
    supports:
      "The passage establishes a fact or states a rule that the sentence relies on as one of its premises",
    contradicts: "The passage contradicts a fact or rule that the sentence relies on",
    says_nothing: "The passage does not bear on any fact or rule the sentence relies on",
  },
};

// Jev takes 32k tokens of state per request. Stay well under it at roughly four characters a token.
const MAX_STATE_CHARS = 60_000;
const MAX_QUESTIONS = 12;

function chunk<T>(items: T[], size: (item: T) => number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = size(item);
    if (current.length > 0 && (current.length >= MAX_QUESTIONS || used + cost > MAX_STATE_CHARS)) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function createJevJudge(options: { model?: string } = {}): Judge {
  const model = options.model ?? "typesafe-ai/jev";
  const usage: JudgeUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };

  function record(result: { usage: { inputTokens?: number; outputTokens?: number } }) {
    usage.requests += 1;
    usage.inputTokens += result.usage.inputTokens ?? 0;
    usage.outputTokens += result.usage.outputTokens ?? 0;
  }

  return {
    usage,

    async support(questions, signal) {
      const answers = new Map<string, SupportAnswer>();
      const batches = chunk(questions, (q) => q.claim.length + q.passage.length);

      const ask = async (batch: typeof questions) => {
        // Question keys are for code and are not sent to the model, so each question names its
        // own slice of the shared state by path.
        const items = Object.fromEntries(
          batch.map((q, i) => [`c${i}`, { claim: q.claim, passage: q.passage }]),
        );
        const asked = Object.fromEntries(
          batch.map((q, i) => [
            `c${i}`,
            {
              type: "choice" as const,
              instructions:
                q.mode === "premise"
                  ? `The sentence in \`items.c${i}.claim\` applies law to facts and draws a conclusion. Ignore whether the conclusion follows. How does the text in \`items.c${i}.passage\` relate to the facts or rules the sentence relies on?`
                  : `How does the text in \`items.c${i}.passage\` relate to the claim in \`items.c${i}.claim\`? Judge only what the passage itself says.`,
              criteria: SUPPORT_CRITERIA[q.mode],
            },
          ]),
        );

        const result = await withRetry(() =>
          evaluate({
            model,
            state: { items },
            questions: asked,
            abortSignal: signal,
          }),
        );
        record(result);
        const reported = (
          result.providerMetadata?.typesafe as { confidence?: Record<string, number> } | undefined
        )?.confidence;

        return batch.map((q, i): [string, SupportAnswer] => {
          const answer = result.answers[`c${i}`] as {
            choice: Relation;
            probabilities?: Record<Relation, number>;
          };
          const probabilities = answer.probabilities ?? {
            supports: answer.choice === "supports" ? 1 : 0,
            contradicts: answer.choice === "contradicts" ? 1 : 0,
            says_nothing: answer.choice === "says_nothing" ? 1 : 0,
          };
          return [
            q.id,
            {
              choice: answer.choice,
              probabilities,
              confidence: reported?.[`c${i}`] ?? Math.max(...Object.values(probabilities)),
            },
          ];
        });
      };

      for (const batch of batches) {
        // A question with no usable answer is left unanswered, and the verifier sends a sentence
        // with an unanswered check to the attorney.
        for (const entry of await inParts(batch, ask, () => null)) {
          if (entry) answers.set(entry[0], entry[1]);
        }
      }
      return answers;
    },

    async classify(sentences, signal) {
      const answers = new Map<string, KindAnswer>();
      // Two questions per sentence, so half as many sentences fit in a request.
      const batches = chunk(sentences, (s) => s.text.length * 2).flatMap((batch) =>
        batch.length > MAX_QUESTIONS / 2
          ? [batch.slice(0, MAX_QUESTIONS / 2), batch.slice(MAX_QUESTIONS / 2)]
          : [batch],
      );

      for (const batch of batches) {
        const items = Object.fromEntries(batch.map((s, i) => [`s${i}`, s.text]));
        const asked = Object.fromEntries(
          batch.flatMap((_, i) => [
            [
              `s${i}_fact`,
              {
                type: "boolean" as const,
                instructions: `Does the sentence in \`items.s${i}\` assert a fact about the parties, documents, dates, amounts or events of a specific dispute?`,
                criteria: {
                  true: "It asserts that something happened, exists, was said, was paid, or was not done",
                  false:
                    "It only states a legal rule, draws a legal conclusion, or asks the court for relief",
                },
              },
            ],
            [
              `s${i}_law`,
              {
                type: "boolean" as const,
                instructions: `Does the sentence in \`items.s${i}\` state a legal rule, a legal standard, or what a court or statute provides?`,
                criteria: {
                  true: "It says what the law is, what a court held, or what a statute or rule requires",
                  false:
                    "It only recites facts of a dispute, or applies an already stated rule to those facts",
                },
              },
            ],
          ]),
        );

        const result = await withRetry(() =>
          evaluate({
            model,
            state: { items },
            questions: asked,
            abortSignal: signal,
          }),
        );
        record(result);
        batch.forEach((s, i) => {
          answers.set(s.id, {
            assertsFact: (result.answers[`s${i}_fact`] as { probability: number }).probability,
            statesLaw: (result.answers[`s${i}_law`] as { probability: number }).probability,
          });
        });
      }
      return answers;
    },

    async relevance(query, passages, signal) {
      const scores = new Map<string, number>();
      for (const batch of chunk(passages, (p) => p.text.length)) {
        const items = Object.fromEntries(batch.map((p, i) => [`p${i}`, p.text]));
        const asked = Object.fromEntries(
          batch.map((_, i) => [
            `p${i}`,
            {
              type: "boolean" as const,
              instructions: `Does the passage in \`items.p${i}\` directly answer or establish what \`query\` asks for?`,
              criteria: {
                true: "The passage itself states the fact, term, testimony or rule the query is looking for",
                false:
                  "The passage is only on a related topic, or mentions the subject without establishing it",
              },
            },
          ]),
        );
        const result = await withRetry(() =>
          evaluate({
            model,
            state: { query, items },
            questions: asked,
            abortSignal: signal,
          }),
        );
        record(result);
        batch.forEach((p, i) => {
          scores.set(p.id, (result.answers[`p${i}`] as { probability: number }).probability);
        });
      }
      return scores;
    },
  };
}
