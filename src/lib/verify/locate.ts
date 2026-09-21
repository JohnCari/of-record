import type { Passage } from "../okf/parse";

/** A quote shorter than this anchors nothing: "the" appears in every document. */
export const MIN_QUOTE_WORDS = 4;

/**
 * Makes a quote comparable across line wraps and typography without making it fuzzy. Case and
 * wording are preserved on purpose: a reworded quote is not a quote.
 */
export function normalize(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripOuterQuotes(text: string): string {
  return text
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .trim();
}

export type Located =
  | { found: true; passage: Passage; context: string }
  | { found: false; reason: string };

/**
 * Finds a quote in a document. An ellipsis splits the quote into segments that must all appear,
 * in order, inside one passage: lawyers elide, but an elision may not stitch together words from
 * different parts of a document.
 */
export function locateQuote(quote: string, passages: Passage[]): Located {
  const cleaned = stripOuterQuotes(normalize(quote));
  const segments = cleaned
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const words = segments.join(" ").split(" ").filter(Boolean).length;
  if (words < MIN_QUOTE_WORDS) {
    return {
      found: false,
      reason: `quote has ${words} words; at least ${MIN_QUOTE_WORDS} are needed to anchor a claim`,
    };
  }

  for (const passage of passages) {
    const haystack = normalize(passage.text);
    let from = 0;
    let matched = true;
    for (const segment of segments) {
      const at = haystack.indexOf(segment, from);
      if (at === -1) {
        matched = false;
        break;
      }
      from = at + segment.length;
    }
    if (matched) {
      return { found: true, passage, context: contextFor(passage, passages) };
    }
  }
  return {
    found: false,
    reason: "quoted words do not appear in the cited source",
  };
}

/**
 * The judge sees the matched passage with its neighbours and its heading. A deposition answer
 * means nothing without its question, a contract clause often depends on the clause before it,
 * and the date and author of an email live in its heading rather than its body.
 */
function contextFor(passage: Passage, passages: Passage[]): string {
  const body = passages
    .filter(
      (other) =>
        Math.abs(other.index - passage.index) <= 1 &&
        other.section === passage.section,
    )
    .map((other) => other.text)
    .join("\n");
  return passage.section ? `[${passage.section}]\n${body}` : body;
}
