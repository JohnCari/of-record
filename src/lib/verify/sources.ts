import type { Passage } from "../okf/parse";

export type RecordDocument = { id: string; title: string; passages: Passage[] };

export interface RecordStore {
  get(docId: string): Promise<RecordDocument | null>;
}

export type Authority = {
  id: string;
  caseName: string;
  citation: string;
  url: string;
  passages: Passage[];
};

export type ResolvedCitation =
  | { status: "found"; authority: Authority }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "invalid"; message: string };

export interface AuthorityResolver {
  resolve(citation: string): Promise<ResolvedCitation>;
}

const NOISE = new Set([
  "v",
  "vs",
  "the",
  "of",
  "and",
  "in",
  "re",
  "ex",
  "rel",
  "et",
  "al",
  "a",
  "an",
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE.has(token));
}

/**
 * How well a drafted case name matches the resolved one, from 0 to 1. Bluebook abbreviates
 * ("W. Distrib. Co." for "Western Distributing Co."), so a token matches when either is a prefix
 * of the other. The score is the share of the shorter name's tokens that found a partner.
 */
export function caseNameMatch(drafted: string, resolved: string): number {
  const a = nameTokens(drafted);
  const b = nameTokens(resolved);
  if (a.length === 0 || b.length === 0) return 0;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const unused = [...longer];
  let matched = 0;
  let substantive = false;

  for (const token of shorter) {
    const at = unused.findIndex(
      (other) => other.startsWith(token) || token.startsWith(other),
    );
    if (at === -1) continue;
    if (Math.min(token.length, unused[at].length) >= 4) substantive = true;
    unused.splice(at, 1);
    matched += 1;
  }
  // Initials alone ("A. B. v. C. D.") match almost anything, so they prove nothing.
  return substantive ? matched / shorter.length : 0;
}

export const NAME_MATCH = 0.6;
export const NAME_MISMATCH = 0.3;
