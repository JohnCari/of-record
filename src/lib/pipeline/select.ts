import { experimental_evaluate as evaluate } from "ai";
import { api } from "../../../convex/_generated/api";
import type { Backend } from "../drafting/backend";
import { MATTER_ID } from "../drafting/sections";
import type { JudgeUsage } from "../verify/judge";
import { normalize } from "../verify/locate";
import { inParts, withRetry } from "../verify/retry";

/**
 * Selection instead of generation. Jev reads every passage of the record and says which part of
 * the claim, if any, it helps establish. Code then quotes the passage. No generative model is
 * involved, so a fact assembled here cannot contain a word that is not in the record.
 */

export type Element = { id: string; label: string; need: string };

export type SelectedFact = {
  elementId: string;
  docId: string;
  docTitle: string;
  docKind: string;
  page: string;
  quote: string;
  /** Jev's probability that the passage helps establish the element. */
  probability: number;
};

const JEV = "typesafe-ai/jev";
const PER_REQUEST = 12;
const CONCURRENCY = 8;
const MAX_QUOTE_CHARS = 420;

type Candidate = {
  id: string;
  docId: string;
  docTitle: string;
  docKind: string;
  page: string;
  text: string;
};

async function pooled<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i]);
      }
    }),
  );
  return results;
}

export async function recordCandidates(
  { convex }: Backend,
  matterId = MATTER_ID,
): Promise<Candidate[]> {
  const sources = await convex.query(api.knowledge.listSources, { matterId, kind: "record" });
  const full = await Promise.all(
    sources.map((s) => convex.query(api.knowledge.getSource, { matterId, sourceId: s.sourceId })),
  );
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const source of full) {
    if (!source) continue;
    for (const passage of source.passages) {
      // The same exhibit is often filed twice, by each side. Quote it once.
      const key = normalize(passage.text).toLowerCase();
      if (seen.has(key) || isFurniture(passage.text)) continue;
      seen.add(key);
      out.push({
        id: `${source.sourceId}#${passage.index}`,
        docId: source.sourceId,
        docTitle: source.title,
        docKind: source.docKind,
        page: passage.section,
        text: passage.text,
      });
    }
  }
  return out;
}

export async function selectFacts(
  backend: Backend,
  elements: Element[],
  options: {
    perElement?: number;
    minProbability?: number;
    usage?: JudgeUsage;
    signal?: AbortSignal;
  } = {},
): Promise<SelectedFact[]> {
  const { perElement = 5, minProbability = 0.6, usage, signal } = options;
  const candidates = await recordCandidates(backend);
  const criteria = Object.fromEntries([
    ...elements.map((e) => [e.id, e.need] as const),
    [
      "none",
      "The passage does not help establish any of these: it is a caption, a signature block, boilerplate, a list, or about something else",
    ] as const,
  ]);

  const batches: Candidate[][] = [];
  for (let i = 0; i < candidates.length; i += PER_REQUEST)
    batches.push(candidates.slice(i, i + PER_REQUEST));

  const ask = async (batch: Candidate[]) => {
    const result = await withRetry(() =>
      evaluate({
        model: JEV,
        state: {
          passages: Object.fromEntries(
            batch.map((c, i) => [`p${i}`, `[${c.docTitle}, ${c.page}] ${c.text}`]),
          ),
        },
        questions: Object.fromEntries(
          batch.map((_, i) => [
            `p${i}`,
            {
              type: "choice" as const,
              instructions: `A lawyer is assembling a statement of undisputed facts. Which point, if any, does the passage in \`passages.p${i}\` itself establish?`,
              criteria,
            },
          ]),
        ),
        abortSignal: signal,
      }),
    );
    if (usage) {
      usage.requests += 1;
      usage.inputTokens += result.usage.inputTokens ?? 0;
      usage.outputTokens += result.usage.outputTokens ?? 0;
    }
    return batch.map((candidate, i) => {
      const answer = result.answers[`p${i}`] as {
        choice: string;
        probabilities?: Record<string, number>;
      };
      return {
        candidate,
        choice: answer.choice,
        probability: answer.probabilities?.[answer.choice] ?? 1,
      };
    });
  };
  // A passage Jev cannot give a usable answer on is left out. Omitting a fact is safe; guessing is not.
  const scored = await pooled(batches, CONCURRENCY, (batch) =>
    inParts(batch, ask, (candidate) => ({ candidate, choice: "none", probability: 0 })),
  );

  const facts: SelectedFact[] = [];
  for (const element of elements) {
    const ranked = scored
      .flat()
      .filter((s) => s.choice === element.id && s.probability >= minProbability)
      .sort((a, b) => b.probability - a.probability);
    // Two scans of one exhibit differ by a few recognition errors, so exact matching misses them.
    const best: typeof ranked = [];
    for (const item of ranked) {
      if (best.length >= perElement) break;
      if (!isQuotable(trimQuote(item.candidate.text))) continue;
      if (best.some((kept) => similarity(kept.candidate.text, item.candidate.text) >= 0.7))
        continue;
      best.push(item);
    }
    for (const { candidate, probability } of best) {
      facts.push({
        elementId: element.id,
        docId: candidate.docId,
        docTitle: candidate.docTitle,
        docKind: candidate.docKind,
        page: candidate.page,
        quote: trimQuote(candidate.text),
        probability,
      });
    }
  }
  return facts;
}

/** A quotation of readable length: whole sentences from the start of the passage. */
export function trimQuote(text: string): string {
  if (text.length <= MAX_QUOTE_CHARS) return text;
  let out = "";
  for (const sentence of text.split(/(?<=[.?!]["')\]]?)\s+(?=[A-Z0-9("'])/)) {
    if (out && out.length + sentence.length > MAX_QUOTE_CHARS) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  // One enormous sentence: cut at a word boundary. Still a verbatim prefix of the passage.
  return out.length > 0 && out.length <= MAX_QUOTE_CHARS * 1.5
    ? out
    : text.slice(0, MAX_QUOTE_CHARS).replace(/\s+\S*$/, "");
}

/**
 * The sentence a brief would write around a quotation. The lead-in has to be true of any passage
 * in the document, because code cannot tell whose words a passage is: affidavits attach letters,
 * contracts and other people's certificates, some with numbered paragraphs of their own, and
 * "Flowers states under oath" in front of an attached tenant certificate would be false. So no
 * lead-in says who said it, only which filing it is in.
 */
export function factSentence(fact: SelectedFact): string {
  const name = fact.docTitle.replace(/^Doc\. [\d-]+: /, "");
  const quoted = `"${fact.quote.replace(/"/g, "'")}"`;
  const person = name.match(/^(Affidavit|Deposition) of ([^,(]+)/);
  if (person?.[1] === "Affidavit")
    return `The affidavit of ${person[2].trim()}, with its exhibits, reads: ${quoted}`;
  if (person?.[1] === "Deposition")
    return `The transcript of ${person[2].trim()}'s deposition reads: ${quoted}`;
  // Drop a trailing date or parenthetical, keep names that contain commas ("Gibson, Dunn & Crutcher").
  const title = name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(
      /,\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b.*$/,
      "",
    );
  // "The letter from ..." but "The Release and Termination Agreement": only a generic first word
  // is lowercased, never a document's own name.
  const generic = /^(Letter|Email|Facsimile|Tenant|Estoppel|Lease)\b/.test(title);
  return `The ${generic ? title.charAt(0).toLowerCase() + title.slice(1) : title} reads: ${quoted}`;
}

/** Letterhead, subject lines, fax headers and table cells: real text, but nothing a fact rests on. */
export function isFurniture(text: string): boolean {
  if (text.length < 90) return true;
  if (/^(re:|facsimile|fax|phone|via |attn|cc:|from:|to:|sent:|subject:|page \d)/i.test(text))
    return true;
  if ((text.match(/\(\d{3}\)\s?\d{3}-\d{4}|\d{3}\.\d{3}\.\d{4}/g) ?? []).length >= 2) return true;
  // A sentence has a verb. A caption or an address block is mostly capitalised words and numbers.
  const words = text.split(/\s+/);
  const lower = words.filter((word) => /^[a-z]{3,}/.test(word)).length;
  return lower / words.length < 0.4;
}

/** A quotation has to say something: long enough to be a sentence, and mostly words. */
export function isQuotable(quote: string): boolean {
  if (quote.length < 70) return false;
  const words = quote.split(/\s+/);
  return words.filter((word) => /^[a-z]{3,}/.test(word)).length / words.length >= 0.45;
}

/** Share of distinct words two passages have in common, from 0 to 1. */
export function similarity(a: string, b: string): number {
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const [x, y] = [words(a), words(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared += 1;
  return shared / Math.min(x.size, y.size);
}
