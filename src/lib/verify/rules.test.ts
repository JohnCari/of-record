import { describe, expect, it } from "vitest";
import { extractRuleCites, opinionMentions } from "./rules";

describe("extractRuleCites", () => {
  it("finds federal rules, Colorado rules, Colorado statutes and the U.S. Code", () => {
    const cites = extractRuleCites(
      "Under Fed. R. Civ. P. 56(a) and C.R.C.P. 56(c), and C.R.S. § 4-2-606(1)(b), with jurisdiction under 28 U.S.C. § 1332(a).",
    );
    expect(cites.map((c) => [c.family, c.number, c.subdivision])).toEqual([
      ["frcp", "56", "(a)"],
      ["crcp", "56", "(c)"],
      ["crs", "4-2-606", "(1)(b)"],
      ["usc", "28:1332", "(a)"],
    ]);
  });

  it("finds nothing in a sentence that cites no provision", () => {
    expect(
      extractRuleCites("Alberta delivered estoppel certificates for 85 of the 92 tenants."),
    ).toEqual([]);
  });
});

describe("opinionMentions", () => {
  const [rule56a] = extractRuleCites("Fed. R. Civ. P. 56(a)");
  const [rule56] = extractRuleCites("Fed. R. Civ. P. 56");
  const [crs] = extractRuleCites("C.R.S. § 4-2-606");

  it("accepts the ways courts write the same rule", () => {
    expect(opinionMentions(rule56a, "Summary judgment is proper under Rule 56(a) when")).toBe(true);
    expect(opinionMentions(rule56a, "See Fed.R.Civ.P. 56(a).")).toBe(true);
    expect(opinionMentions(rule56, "Rule 56(c) mandates the entry of summary judgment")).toBe(true);
  });

  it("treats a different subdivision as a different provision", () => {
    expect(opinionMentions(rule56a, "Rule 56(c) mandates the entry of summary judgment")).toBe(
      false,
    );
  });

  it("does not match a different rule or a longer number", () => {
    expect(opinionMentions(rule56, "Rule 560 has nothing to do with it, nor does Rule 5.")).toBe(
      false,
    );
    expect(opinionMentions(crs, "as provided in section 4-2-606, acceptance occurs")).toBe(true);
    expect(opinionMentions(crs, "as provided in § 4-2-6061")).toBe(false);
  });
});
