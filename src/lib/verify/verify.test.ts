import { describe, expect, it } from "vitest";
import type { Passage } from "../okf/parse";
import { evaluateGate } from "./gate";
import type { Judge, KindAnswer, Relation, SupportAnswer } from "./judge";
import { locateQuote, normalize } from "./locate";
import {
  type AuthorityResolver,
  caseNameMatch,
  type RecordStore,
  type ResolvedCitation,
} from "./sources";
import type { DraftSentence } from "./types";
import { DEFAULT_OPTIONS, statusOf, verifySentences } from "./verify";

const passages = (texts: string[], section = "Page 2"): Passage[] =>
  texts.map((text, index) => ({ index, section, text }));

// Real text from the record: the Escrow Agreement, Doc. 228-1, with its recognition error kept.
const DEPO = passages([
  '1.1 Deposit of Funds. Pursuant to the Purchase Agreement, Escrow Agent shall retain an amount equal to $650,000.00 (the "Deposit") out of the Excess Funds to be paid to Seller at Closing, which amount shal! be deposited into a separate escrow account governed by this Agreement.',
  "In the absence of written instructions from Alberta and Granite, the Escrow Agent will, at its discretion, invest the Cash Funds as set forth in clauses (i) or (ii) below. Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta.",
]);

const record: RecordStore = {
  async get(docId) {
    return docId === "doc-228-1"
      ? {
          id: "doc-228-1",
          title: "Doc. 228-1: Escrow Agreement",
          passages: DEPO,
        }
      : null;
  },
};

const OPINION = passages(
  [
    "Summary judgment is a drastic remedy and is appropriate only when there is no genuine issue of material fact.",
  ],
  "II. Standard",
);

function resolver(table: Record<string, ResolvedCitation>): AuthorityResolver {
  return {
    resolve: async (citation) => table[citation] ?? { status: "not_found" },
  };
}

const found: ResolvedCitation = {
  status: "found",
  authority: {
    id: "cl-1",
    caseName: "Western Distributing Co. v. Diodosio",
    citation: "841 P.2d 1053",
    url: "https://www.courtlistener.com/opinion/1/",
    passages: OPINION,
  },
};

/** A judge that answers from a script, so each verdict path is exercised without a model. */
function scriptedJudge(
  relation: (claim: string) => { choice: Relation; confidence: number },
  kind: (text: string) => KindAnswer = () => ({ assertsFact: 0, statesLaw: 0 }),
): Judge & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    usage: { requests: 0, inputTokens: 0, outputTokens: 0 },
    async support(questions) {
      return new Map(
        questions.map((q): [string, SupportAnswer] => {
          asked.push(q.id);
          const { choice, confidence } = relation(q.claim);
          const probabilities = {
            supports: 0,
            contradicts: 0,
            says_nothing: 0,
            [choice]: confidence,
          };
          return [q.id, { choice, probabilities, confidence }];
        }),
      );
    },
    async classify(sentences) {
      return new Map(sentences.map((s) => [s.id, kind(s.text)]));
    },
    async relevance(_query, passages) {
      return new Map(passages.map((p) => [p.id, 1]));
    },
  };
}

const supportsAll = () => scriptedJudge(() => ({ choice: "supports", confidence: 0.97 }));

const fact = (id: string, text: string, quote: string, docId = "doc-228-1"): DraftSentence => ({
  id,
  text,
  kind: "fact",
  recordCites: [{ docId, quote }],
  authorityCites: [],
});

describe("locateQuote", () => {
  it("matches across typography and line wraps, not across rewording", () => {
    expect(normalize("“Deposit”  out\nof")).toBe('"Deposit" out of');
    expect(
      locateQuote(
        "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
        DEPO,
      ).found,
    ).toBe(true);
    expect(
      locateQuote(
        "Escrow Agent shall pay all interest earned on the Cash Funds each month to Alberta",
        DEPO,
      ).found,
    ).toBe(false);
  });

  it("allows an ellipsis inside one passage and refuses to stitch two passages together", () => {
    expect(
      locateQuote("Escrow Agent shall disburse ... on a monthly basis to Alberta", DEPO).found,
    ).toBe(true);
    expect(
      locateQuote("a separate escrow account ... Escrow Agent shall disburse all interest", DEPO)
        .found,
    ).toBe(false);
  });

  it("refuses a quote too short to anchor anything", () => {
    const result = locateQuote("No.", DEPO);
    expect(result.found).toBe(false);
    expect(!result.found && result.reason).toMatch(/at least 4/);
  });

  it("gives the judge the paragraph before the quoted one", () => {
    const result = locateQuote(
      "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
      DEPO,
    );
    expect(result.found && result.context).toMatch(/a separate escrow account/);
  });
});

describe("caseNameMatch", () => {
  it("accepts Bluebook abbreviations of the same case", () => {
    expect(
      caseNameMatch("W. Distrib. Co. v. Diodosio", "Western Distributing Co. v. Diodosio"),
    ).toBeGreaterThanOrEqual(0.6);
  });
  it("rejects a different case", () => {
    expect(
      caseNameMatch(
        "Hartwell Supply Co. v. Dunmore Retail Group",
        "Western Distributing Co. v. Diodosio",
      ),
    ).toBeLessThan(0.3);
  });
  it("does not let bare initials match", () => {
    expect(caseNameMatch("W. D. v. D.", "Western Distributing Co. v. Diodosio")).toBe(0);
  });
});

describe("verifySentences", () => {
  const deps = (judge: Judge, table: Record<string, ResolvedCitation> = {}) => ({
    record,
    authorities: resolver(table),
    judge,
  });

  it("verifies a fact whose quote is real and supported", async () => {
    const [v] = await verifySentences(
      [
        fact(
          "s1",
          "The escrow agent was to pay the interest on the escrowed funds to Alberta each month.",
          "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
        ),
      ],
      deps(supportsAll()),
    );
    expect(v.status).toBe("verified");
    expect(v.checks[0].evidence?.section).toBe("Page 2");
  });

  it("blocks a fabricated quote in code, without asking the judge", async () => {
    const judge = supportsAll();
    const [v] = await verifySentences(
      [
        fact(
          "s1",
          "The funds were to be released to Alberta automatically on March 1, 2009.",
          "the Cash Funds shall be released to Alberta automatically on March 1, 2009",
        ),
      ],
      deps(judge),
    );
    expect(v.status).toBe("blocked");
    expect(v.checks[0]).toMatchObject({ verdict: "fabricated", stage: "code" });
    expect(judge.asked).toHaveLength(0);
  });

  it("blocks a cite to an exhibit that does not exist", async () => {
    const [v] = await verifySentences(
      [fact("s1", "x", "some words that are long enough", "ex-z")],
      deps(supportsAll()),
    );
    expect(v.checks[0]).toMatchObject({ verdict: "fabricated", stage: "code" });
  });

  it("blocks a real quote that contradicts the sentence", async () => {
    const judge = scriptedJudge(() => ({
      choice: "contradicts",
      confidence: 0.99,
    }));
    const [v] = await verifySentences(
      [
        fact(
          "s1",
          "The escrow agent was to pay the interest on the escrowed funds to Granite.",
          "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
        ),
      ],
      deps(judge),
    );
    expect(v.status).toBe("blocked");
    expect(v.checks[0].verdict).toBe("contradicted");
  });

  it("sends a low-confidence judgment to review instead of acting on it", async () => {
    const judge = scriptedJudge(() => ({
      choice: "says_nothing",
      confidence: 0.41,
    }));
    const [v] = await verifySentences(
      [
        fact(
          "s1",
          "Alberta delivered every tenant estoppel certificate on time.",
          "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
        ),
      ],
      deps(judge),
    );
    expect(v.status).toBe("review");
  });

  it("blocks a fictitious citation and a mismatched one in code", async () => {
    const law = (id: string, citation: string, caseName: string): DraftSentence => ({
      id,
      text: "Summary judgment is proper when no material fact is disputed.",
      kind: "law",
      recordCites: [],
      authorityCites: [
        {
          citation,
          caseName,
          quote: "appropriate only when there is no genuine issue of material fact",
        },
      ],
    });
    const judge = supportsAll();
    const [fictitious, mismatched, good] = await verifySentences(
      [
        law("s1", "512 P.3d 880", "Hartwell Supply Co. v. Dunmore Retail Group"),
        law("s2", "841 P.2d 1053", "Hartwell Supply Co. v. Dunmore Retail Group"),
        law("s3", "841 P.2d 1053", "W. Distrib. Co. v. Diodosio"),
      ],
      deps(judge, { "841 P.2d 1053": found }),
    );
    expect(fictitious.checks[0]).toMatchObject({
      verdict: "fictitious",
      stage: "code",
    });
    expect(mismatched.checks[0]).toMatchObject({
      verdict: "mismatched",
      stage: "code",
    });
    expect(good.status).toBe("verified");
    expect(judge.asked).toEqual(["s3:a0"]);
  });

  it("blocks a real quote from a real case hung on the wrong rule", async () => {
    const law = (id: string, text: string): DraftSentence => ({
      id,
      text,
      kind: "law",
      recordCites: [],
      authorityCites: [
        {
          citation: "841 P.2d 1053",
          caseName: "W. Distrib. Co. v. Diodosio",
          quote: "appropriate only when there is no genuine issue of material fact",
        },
      ],
    });
    const withRule: ResolvedCitation = {
      status: "found",
      authority: {
        ...(found as Extract<ResolvedCitation, { status: "found" }>).authority,
        passages: passages(
          [
            "Under C.R.C.P. 56(c), summary judgment is appropriate only when there is no genuine issue of material fact.",
          ],
          "II. Standard",
        ),
      },
    };
    const [right, wrong] = await verifySentences(
      [
        law(
          "s1",
          "Under C.R.C.P. 56(c), summary judgment requires the absence of a genuine issue of material fact.",
        ),
        law(
          "s2",
          "Under C.R.C.P. 12(b)(5), summary judgment requires the absence of a genuine issue of material fact.",
        ),
      ],
      deps(supportsAll(), { "841 P.2d 1053": withRule }),
    );
    expect(right.status).toBe("verified");
    expect(wrong.status).toBe("blocked");
    const ruleCheck = wrong.checks.find((check) => check.verdict === "mismatched");
    expect(ruleCheck).toMatchObject({ stage: "code", target: "sentence" });
    expect(ruleCheck?.reason).toMatch(/C\.R\.C\.P\. 12\(b\)\(5\)/);
  });

  it("routes an ambiguous citation to review", async () => {
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "A rule.",
          kind: "law",
          recordCites: [],
          authorityCites: [
            {
              citation: "1 P. 1",
              caseName: "A v. B",
              quote: "four words or more here",
            },
          ],
        },
      ],
      deps(supportsAll(), {
        "1 P. 1": { status: "ambiguous", candidates: ["A v. B", "C v. D"] },
      }),
    );
    expect(v.status).toBe("review");
  });

  it("blocks a declared fact or law with no cite, in code", async () => {
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "Alberta never delivered the certificates.",
          kind: "fact",
          recordCites: [],
          authorityCites: [],
        },
      ],
      deps(supportsAll()),
    );
    expect(v.status).toBe("blocked");
    expect(v.checks[0]).toMatchObject({ verdict: "uncited", stage: "code" });
  });

  it("does not let the drafter dodge the gate by calling a fact an argument", async () => {
    const judge = scriptedJudge(
      () => ({ choice: "supports", confidence: 0.99 }),
      () => ({ assertsFact: 0.93, statesLaw: 0.02 }),
    );
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "The funds were to be released to Alberta automatically on March 1, 2009.",
          kind: "argument",
          recordCites: [],
          authorityCites: [],
        },
      ],
      deps(judge),
    );
    expect(v.effectiveKind).toBe("fact");
    expect(v.status).toBe("review");
  });

  it("checks the premises of an application sentence and leaves the conclusion to a person", async () => {
    const modes: string[] = [];
    const judge = supportsAll();
    const support = judge.support.bind(judge);
    judge.support = async (questions, signal) => {
      modes.push(...questions.map((q) => q.mode));
      return support(questions, signal);
    };
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "Because the agreement directs the interest to Alberta, Granite has no claim to it.",
          kind: "argument",
          recordCites: [
            {
              docId: "doc-228-1",
              quote:
                "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
            },
          ],
          authorityCites: [],
        },
      ],
      deps(judge),
    );
    expect(modes).toEqual(["premise"]);
    // Supported premises never make the sentence "verified": the inference was not checked.
    expect(v.status).toBe("review");
    expect(v.checks.map((c) => c.verdict)).toEqual(["verified", "ambiguous"]);
    expect(v.checks[0].reason).toMatch(/relies on/);
    expect(v.checks[0]).not.toHaveProperty("premise");
  });

  it("blocks an application sentence whose premise is contradicted", async () => {
    const judge = scriptedJudge(() => ({ choice: "contradicts", confidence: 0.97 }));
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "Because the agreement directs the interest to Granite, Alberta has no claim to it.",
          kind: "argument",
          recordCites: [
            {
              docId: "doc-228-1",
              quote:
                "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
            },
          ],
          authorityCites: [],
        },
      ],
      deps(judge),
    );
    expect(v.status).toBe("blocked");
  });

  it("flags, but does not block, an application sentence with a cite that does not bear on it", async () => {
    const judge = scriptedJudge(() => ({ choice: "says_nothing", confidence: 0.95 }));
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "Because the certificates disclosed a dispute, the condition for release was not met.",
          kind: "argument",
          recordCites: [
            {
              docId: "doc-228-1",
              quote:
                "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
            },
          ],
          authorityCites: [],
        },
      ],
      deps(judge),
    );
    expect(v.status).toBe("review");
    expect(v.checks[0].verdict).toBe("ambiguous");
    expect(v.checks[0].reason).toMatch(/does not bear/);
  });

  it("exempts a pure argument", async () => {
    const [v] = await verifySentences(
      [
        {
          id: "s1",
          text: "The Court should therefore grant the motion.",
          kind: "argument",
          recordCites: [],
          authorityCites: [],
        },
      ],
      deps(supportsAll()),
    );
    expect(v.status).toBe("exempt");
  });

  it("treats a missing judge answer as review, never as a pass", async () => {
    const silent: Judge = {
      usage: { requests: 0, inputTokens: 0, outputTokens: 0 },
      support: async () => new Map(),
      classify: async () => new Map(),
      relevance: async () => new Map(),
    };
    const [v] = await verifySentences(
      [
        fact(
          "s1",
          "x",
          "Escrow Agent shall disburse all interest earned on the Cash Funds on a monthly basis to Alberta",
        ),
      ],
      deps(silent),
    );
    expect(v.status).toBe("review");
  });
});

describe("statusOf", () => {
  it("is exempt only when there was nothing to check", () => {
    expect(statusOf([], DEFAULT_OPTIONS.confidenceThreshold)).toBe("exempt");
  });
});

describe("evaluateGate", () => {
  const v = (sentenceId: string, status: "verified" | "blocked" | "review" | "exempt") => ({
    sentenceId,
    status,
    declaredKind: "fact" as const,
    effectiveKind: "fact" as const,
    checks: [],
  });

  it("stays shut while any sentence is blocked, in review, or never verified", () => {
    const result = evaluateGate(
      ["a", "b", "c", "d"],
      [v("a", "verified"), v("b", "blocked"), v("c", "review")],
      [],
    );
    expect(result).toEqual({
      open: false,
      blocking: [
        { sentenceId: "b", status: "blocked" },
        { sentenceId: "c", status: "review" },
        { sentenceId: "d", status: "unverified" },
      ],
    });
  });

  it("opens once a person has decided every open sentence", () => {
    const result = evaluateGate(
      ["a", "b", "c"],
      [v("a", "verified"), v("b", "blocked"), v("c", "exempt")],
      [
        {
          sentenceId: "b",
          decision: "strike",
          by: "attorney",
          reason: "not in the record",
        },
      ],
    );
    expect(result).toEqual({
      open: true,
      verified: 1,
      exempt: 1,
      accepted: 0,
      struck: 1,
    });
  });
});
