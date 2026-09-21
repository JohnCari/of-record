import { describe, expect, it } from "vitest";
import { passagesFromFiling } from "./filing";

const LONG =
  "The parties agree that the Escrowed Funds shall be released only upon delivery of the certificates. ";

describe("passagesFromFiling", () => {
  it("removes both forms of page stamp and keeps the page number", () => {
    const text = [
      "Case No. 1:09-cv-00799-SJJ-KLM Document 78-1 filed 12/10/09 USDC Colorado pg 1 of 18",
      `${LONG}`,
      "",
      "Case 1:09-cv-00799-SJJ -KLM Document 195 Filed 09/02/11 USDC Colorado Page 2 of",
      " 16",
      `${LONG}${LONG}`,
    ].join("\n");
    const passages = passagesFromFiling(text);
    expect(passages.map((p) => p.section)).toEqual(["Page 1", "Page 2"]);
    expect(passages.every((p) => !/USDC|Case No|cv-00799/.test(p.text))).toBe(true);
  });

  it("changes no words: every passage is a substring of the whitespace-collapsed source", () => {
    const source = `Case No. 1:09-cv-00799 Document 1 filed 1/1/09 USDC Colorado pg 3 of 9\n${LONG}\n\nSecond paragraph, which is\nwrapped across lines and is long enough to stand alone.`;
    const flat = source.replace(/\s+/g, " ");
    for (const passage of passagesFromFiling(source)) expect(flat).toContain(passage.text);
  });

  it("drops the symbol runs a scanner makes of logos and signatures", () => {
    const passages = passagesFromFiling(
      `${LONG}\n\n|||| ~~~~ ---- //// \\\\\\\\ ==== ++++ **** #### %%%% @@@@ !!!!\n\n${LONG}`,
    );
    expect(passages).toHaveLength(2);
  });

  it("splits a very long block at sentence boundaries", () => {
    const passages = passagesFromFiling(LONG.repeat(20));
    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) expect(passage.text.length).toBeLessThanOrEqual(1000);
  });
});
