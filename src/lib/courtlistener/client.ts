import type { Passage } from "../okf/parse";

const BASE = "https://www.courtlistener.com";

export type SearchHit = {
  clusterId: number;
  caseName: string;
  citations: string[];
  court: string;
  dateFiled: string;
  citeCount: number;
  url: string;
  opinionIds: number[];
};

export type LookupResult = {
  citation: string;
  normalized: string[];
  /** CourtListener's own HTTP-style code: 200 found, 404 not found, 300 ambiguous, 400 invalid. */
  status: number;
  message: string;
  clusters: {
    id: number;
    caseName: string;
    url: string;
    citations: string[];
    opinionIds: number[];
  }[];
};

type Fetch = typeof fetch;

export class CourtListenerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createCourtListener(
  options: { token?: string; fetch?: Fetch; sleep?: (ms: number) => Promise<void> } = {},
) {
  const doFetch = options.fetch ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token) headers.authorization = `Token ${options.token}`;

  async function request(path: string, init?: RequestInit, attempt = 0): Promise<unknown> {
    const response = await doFetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
    if (response.status === 429 && attempt < 4) {
      const wait = Number(response.headers.get("retry-after")) || 2 ** attempt * 3;
      await sleep(wait * 1000);
      return request(path, init, attempt + 1);
    }
    if (!response.ok) {
      throw new CourtListenerError(
        response.status,
        `CourtListener ${response.status} on ${path.split("?")[0]}`,
      );
    }
    return response.json();
  }

  return {
    /** Full-text opinion search. Works without a token, at a lower rate limit. */
    async search(
      query: string,
      params: { court?: string; limit?: number; orderBy?: "score desc" | "citeCount desc" } = {},
    ): Promise<SearchHit[]> {
      const qs = new URLSearchParams({
        q: query,
        type: "o",
        order_by: params.orderBy ?? "score desc",
        format: "json",
      });
      if (params.court) qs.set("court", params.court);
      const data = (await request(`/api/rest/v4/search/?${qs}`)) as { results: RawHit[] };
      return data.results.slice(0, params.limit ?? 10).map((hit) => ({
        clusterId: hit.cluster_id,
        caseName: hit.caseName,
        citations: hit.citation ?? [],
        court: hit.court_citation_string ?? hit.court ?? "",
        dateFiled: hit.dateFiled ?? "",
        citeCount: hit.citeCount ?? 0,
        url: `${BASE}${hit.absolute_url}`,
        opinionIds: (hit.opinions ?? []).map((opinion) => opinion.id),
      }));
    },

    /**
     * Resolves reporter citations found in free text. This is the guardrail Free Law Project built
     * against invented citations: a well-formed cite to a case that does not exist comes back 404.
     */
    async lookup(text: string): Promise<LookupResult[]> {
      const data = (await request("/api/rest/v4/citation-lookup/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text }).toString(),
      })) as RawLookup[];
      return data.map((item) => ({
        citation: item.citation,
        normalized: item.normalized_citations ?? [],
        status: item.status,
        message: item.error_message ?? "",
        clusters: (item.clusters ?? []).map((cluster) => ({
          id: cluster.id,
          caseName: cluster.case_name,
          url: `${BASE}${cluster.absolute_url}`,
          citations: (cluster.citations ?? []).map((c) => `${c.volume} ${c.reporter} ${c.page}`),
          opinionIds: (cluster.sub_opinions ?? [])
            .map((url) => Number(url.match(/opinions\/(\d+)/)?.[1]))
            .filter((id) => Number.isFinite(id)),
        })),
      }));
    },

    async opinionText(opinionId: number): Promise<{ type: string; text: string }> {
      const data = (await request(`/api/rest/v4/opinions/${opinionId}/?format=json`)) as RawOpinion;
      const html =
        data.html_with_citations ||
        data.html ||
        data.html_lawbox ||
        data.html_columbia ||
        data.xml_harvard ||
        "";
      return { type: data.type ?? "", text: html ? htmlToText(html) : (data.plain_text ?? "") };
    },
  };
}

export type CourtListener = ReturnType<typeof createCourtListener>;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&sect;": "§",
  "&para;": "¶",
  "&mdash;": "—",
  "&ndash;": "–",
};

/** Opinion HTML to plain paragraphs. Block elements become paragraph breaks; footnote markers go. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<\/(p|div|blockquote|h[1-6]|li|tr|center)>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

/** Paragraphs long enough to carry a rule. Headers, captions and page furniture are dropped. */
export function opinionPassages(text: string, minChars = 80): Passage[] {
  return text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= minChars)
    .map((paragraph, index) => ({ index, section: "", text: paragraph }));
}

type RawHit = {
  cluster_id: number;
  caseName: string;
  citation?: string[];
  court?: string;
  court_citation_string?: string;
  dateFiled?: string;
  citeCount?: number;
  absolute_url: string;
  opinions?: { id: number }[];
};

type RawLookup = {
  citation: string;
  normalized_citations?: string[];
  status: number;
  error_message?: string;
  clusters?: {
    id: number;
    case_name: string;
    absolute_url: string;
    citations?: { volume: number | string; reporter: string; page: string }[];
    sub_opinions?: string[];
  }[];
};

type RawOpinion = {
  type?: string;
  plain_text?: string;
  html?: string;
  html_with_citations?: string;
  html_lawbox?: string;
  html_columbia?: string;
  xml_harvard?: string;
};
