/**
 * Rule and statute citations.
 *
 * The only source here is case law, so a rule is verified as quoted by a court: a sentence that
 * cites "Fed. R. Civ. P. 56(a)" must rest on an opinion that itself mentions Rule 56(a). Without
 * this, a drafter could attach a real quote from a real case to the wrong provision, and every
 * other check would pass. That is the "wrong statute" failure.
 */

export type RuleCite = {
  family: "frcp" | "crcp" | "crs" | "usc";
  /** Rule number, section number, or "title:section" for the U.S. Code. */
  number: string;
  /** Subdivision as written, e.g. "(c)" or "(a)(3)". Empty when the cite names none. */
  subdivision: string;
  /** The citation as it appears in the sentence, for messages. */
  text: string;
};

const SUB = String.raw`((?:\([a-z0-9]+\))*)`;

const PATTERNS: {
  family: RuleCite["family"];
  re: RegExp;
  number: (m: RegExpExecArray) => string;
  sub: number;
}[] = [
  {
    family: "frcp",
    re: new RegExp(
      String.raw`Fed(?:eral)?\.?\s*R(?:ules?)?\.?\s*(?:of\s+)?Civ(?:il)?\.?\s*P(?:roc(?:edure)?)?\.?\s*(\d+)${SUB}`,
      "gi",
    ),
    number: (m) => m[1],
    sub: 2,
  },
  {
    family: "crcp",
    re: new RegExp(String.raw`C\.\s?R\.\s?C\.\s?P\.?\s*(\d+)${SUB}`, "gi"),
    number: (m) => m[1],
    sub: 2,
  },
  {
    family: "crs",
    re: new RegExp(String.raw`C\.\s?R\.\s?S\.?\s*§+\s*(\d+(?:-\d+)+(?:\.\d+)?)${SUB}`, "gi"),
    number: (m) => m[1],
    sub: 2,
  },
  {
    family: "usc",
    re: new RegExp(String.raw`(\d+)\s*U\.\s?S\.\s?C\.?\s*§+\s*(\d+[a-z]?)${SUB}`, "gi"),
    number: (m) => `${m[1]}:${m[2]}`,
    sub: 3,
  },
];

export function extractRuleCites(sentence: string): RuleCite[] {
  const found: RuleCite[] = [];
  for (const { family, re, number, sub } of PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(sentence); m !== null; m = re.exec(sentence)) {
      found.push({
        family,
        number: number(m),
        subdivision: (m[sub] ?? "").toLowerCase(),
        text: m[0].trim(),
      });
    }
  }
  return found;
}

/**
 * Whether an opinion mentions the provision. Courts write rules many ways ("Rule 56(c)",
 * "Fed.R.Civ.P. 56(c)", "section 4-2-606"), so the match is on the number and the subdivision, not
 * on the form of the citation. When the sentence names a subdivision the opinion must name the
 * same one: Rule 56(a) and Rule 56(c) are different text.
 */
export function opinionMentions(rule: RuleCite, opinionText: string): boolean {
  const text = opinionText.replace(/\s+/g, " ");
  const sub = rule.subdivision.replace(/[()]/g, (c) => `\\${c}`);

  if (rule.family === "frcp" || rule.family === "crcp") {
    // "Rule 56(c)", "Fed. R. Civ. P. 56(c)", "C.R.C.P. 56(c)": a rule word or abbreviation, then the number.
    const lead = String.raw`(?:Rules?|R\.|P\.)\s*`;
    return (
      new RegExp(`${lead}${rule.number}${sub}(?![\\d(])`, "i").test(text) ||
      (sub === "" && new RegExp(`${lead}${rule.number}\\(`, "i").test(text))
    );
  }
  if (rule.family === "crs") {
    const section = rule.number.replace(/[.-]/g, (c) => `\\${c}`);
    return (
      new RegExp(`(?:§+|sections?)\\s*${section}${sub}(?![\\d.-])`, "i").test(text) ||
      (sub === "" && new RegExp(`(?:§+|sections?)\\s*${section}\\(`, "i").test(text))
    );
  }
  const [title, section] = rule.number.split(":");
  return (
    new RegExp(
      `${title}\\s*U\\.\\s?S\\.\\s?C\\.?[^.]{0,12}?§+\\s*${section}${sub}(?![\\da-z])`,
      "i",
    ).test(text) ||
    (sub === "" &&
      new RegExp(`${title}\\s*U\\.\\s?S\\.\\s?C\\.?[^.]{0,12}?§+\\s*${section}\\(`, "i").test(text))
  );
}
