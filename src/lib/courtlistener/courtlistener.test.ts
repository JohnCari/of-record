import { describe, expect, it } from "vitest";
import { createCourtListener, htmlToText, opinionPassages } from "./client";
import { courtListenerResolver } from "./resolver";

/** A fetch that serves canned CourtListener responses by path. */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));
    const route = match ? routes[match] : { status: 404, body: { detail: "no route" } };
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as typeof fetch;
}

const RULE =
  "Summary judgment is a drastic remedy and is never warranted except on a clear showing that there exists no genuine issue as to any material fact.";

const lookupFound = [
  {
    citation: "759 P.2d 1336",
    normalized_citations: ["759 P.2d 1336"],
    status: 200,
    clusters: [
      {
        id: 1215405,
        case_name: "Churchey v. Adolph Coors Co.",
        absolute_url: "/opinion/1215405/churchey-v-adolph-coors-co/",
        citations: [{ volume: 759, reporter: "P.2d", page: "1336" }],
        sub_opinions: [
          "https://www.courtlistener.com/api/rest/v4/opinions/111/",
          "https://www.courtlistener.com/api/rest/v4/opinions/222/",
        ],
      },
    ],
  },
];

describe("htmlToText", () => {
  it("turns block elements into paragraphs and drops footnote markers", () => {
    const text = htmlToText(
      '<div><p>First &amp; <i>foremost</i>.<sup><a href="#fn1">1</a></sup></p><p>Section&nbsp;4-2-606 &mdash; acceptance.</p></div>',
    );
    expect(text).toBe("First & foremost.\n\nSection 4-2-606 — acceptance.");
  });

  it("keeps only paragraphs long enough to carry a rule", () => {
    const passages = opinionPassages(`II.\n\n${RULE}\n\nAffirmed.`);
    expect(passages).toEqual([{ index: 0, section: "", text: RULE }]);
  });
});

describe("courtListenerResolver", () => {
  it("prefers the opinion of the court over a dissent", async () => {
    const cl = createCourtListener({
      token: "t",
      fetch: fakeFetch({
        "citation-lookup": { body: lookupFound },
        "opinions/111": {
          body: { type: "040dissent", html: `<p>${"I would reverse. ".repeat(10)}</p>` },
        },
        "opinions/222": { body: { type: "020lead-opinion", html: `<p>${RULE}</p>` } },
      }),
    });
    const result = await courtListenerResolver(cl).resolve("759 P.2d 1336");
    expect(result.status).toBe("found");
    expect(result.status === "found" && result.authority).toMatchObject({
      id: "cl-1215405",
      caseName: "Churchey v. Adolph Coors Co.",
      passages: [{ text: RULE }],
    });
  });

  it("reports a citation to no case as not found", async () => {
    const cl = createCourtListener({
      token: "t",
      fetch: fakeFetch({
        "citation-lookup": { body: [{ citation: "512 P.3d 880", status: 404, clusters: [] }] },
      }),
    });
    expect(await courtListenerResolver(cl).resolve("512 P.3d 880")).toEqual({
      status: "not_found",
    });
  });

  it("reports more than one match as ambiguous", async () => {
    const two = [
      {
        ...lookupFound[0],
        status: 300,
        clusters: [
          lookupFound[0].clusters[0],
          { ...lookupFound[0].clusters[0], id: 9, case_name: "Other v. Case" },
        ],
      },
    ];
    const cl = createCourtListener({
      token: "t",
      fetch: fakeFetch({ "citation-lookup": { body: two } }),
    });
    expect(await courtListenerResolver(cl).resolve("759 P.2d 1336")).toEqual({
      status: "ambiguous",
      candidates: ["Churchey v. Adolph Coors Co.", "Other v. Case"],
    });
  });

  it("never turns an outage into a finding about the case", async () => {
    for (const status of [401, 429, 500]) {
      const waits: number[] = [];
      const cl = createCourtListener({
        fetch: fakeFetch({ "citation-lookup": { status, body: { detail: "x" } } }),
        sleep: async (ms) => void waits.push(ms),
      });
      const result = await courtListenerResolver(cl).resolve("759 P.2d 1336");
      expect(result.status).toBe("unavailable");
      // A throttle is retried with backoff before giving up; other failures are not retried.
      expect(waits.length).toBe(status === 429 ? 4 : 0);
    }
  });

  it("answers from the seeded corpus without a network call", async () => {
    const cl = createCourtListener({ fetch: fakeFetch({}) });
    const authority = {
      id: "a",
      caseName: "A v. B",
      citation: "1 P.3d  2",
      url: "u",
      passages: [],
    };
    const result = await courtListenerResolver(cl, [authority]).resolve("1 p.3d 2");
    expect(result).toEqual({ status: "found", authority });
  });
});
