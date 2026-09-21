import { describe, expect, it } from "vitest";
import { factSentence, isFurniture, isQuotable, similarity, trimQuote } from "./select";

const fact = (docTitle: string, docKind: string, quote: string) => ({
  elementId: "e",
  docId: "doc-1",
  docTitle,
  docKind,
  page: "Page 1",
  quote,
  probability: 0.9,
});

describe("factSentence", () => {
  it("never says who said it, because an affidavit attaches other people's documents", () => {
    // Paragraph 5 of a tenant's certificate, attached to a lawyer's affidavit. It is numbered like
    // the affiant's own paragraphs, and the affiant did not say it.
    const attached = factSentence(
      fact(
        "Doc. 86-1: Affidavit of Drew C. Flowers",
        "affidavit",
        "5. There are no existing claims, defenses or offsets by or in favor of the Tenant.",
      ),
    );
    expect(attached).toMatch(/^The affidavit of Drew C\. Flowers, with its exhibits, reads: /);
    expect(attached).not.toMatch(/states|under oath|testified/);
    expect(
      factSentence(
        fact(
          "Doc. 87-6: Deposition of Donald G. Provost, January 8, 2010 (excerpts)",
          "deposition",
          "A. I signed it.",
        ),
      ),
    ).toMatch(/^The transcript of Donald G\. Provost's deposition reads: /);
  });

  it("drops a trailing date but keeps a name that contains commas", () => {
    expect(
      factSentence(
        fact(
          "Doc. 84-2: Letter from Gibson, Dunn & Crutcher to BlackRock, February 27, 2009",
          "correspondence",
          "Alberta demands release.",
        ),
      ),
    ).toBe(
      'The letter from Gibson, Dunn & Crutcher to BlackRock reads: "Alberta demands release."',
    );
  });

  it("lowercases a generic first word but never a document's own name", () => {
    expect(
      factSentence(
        fact(
          "Doc. 78-1: Release and Termination Agreement, December 2008",
          "agreement",
          "Alberta shall deliver the certificates.",
        ),
      ),
    ).toBe(
      'The Release and Termination Agreement reads: "Alberta shall deliver the certificates."',
    );
  });
});

describe("isFurniture", () => {
  it("rejects letterhead, subject lines and table cells", () => {
    expect(
      isFurniture(
        "Facsimile: (213) 229-6885 Re: Southlands Town Center, Aurora, Colorado; Forward Purchase and Sale Agreement and Escrow Instructions",
      ),
    ).toBe(true);
    expect(isFurniture("“Objected” in the column entitled “Status.”")).toBe(true);
    expect(
      isFurniture(
        "GRANITE SOUTHLANDS TOWN CENTER LLC, Plaintiff, V. ALBERTA TOWN CENTER, LLC and LAND TITLE GUARANTEE COMPANY, Defendants.",
      ),
    ).toBe(true);
  });

  it("keeps a sentence that states something", () => {
    expect(
      isFurniture(
        "Peter, two of the estoppels came back indicating a fairly substantial settlement issue. I believe DCC Architects and Colorado Cinemas.",
      ),
    ).toBe(false);
  });
});

describe("similarity", () => {
  it("sees through the recognition errors between two scans of one exhibit", () => {
    const a =
      "Tenant is currently investigating and may dispute Landlord's assertion that Tenant is financially responsible for repairing the cracked foundation.";
    const b =
      "Tenant is currentiy investigating and may dispute Landlord’s assertion that Tenant is financially responsibie for repairing the cracked foundation";
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.7);
    expect(
      similarity(a, "Alberta delivered estoppel certificates for at least 85 of the 92 tenants."),
    ).toBeLessThan(0.3);
  });
});

describe("trimQuote", () => {
  it("returns a verbatim prefix made of whole sentences", () => {
    const text = `${"The Escrowed Funds shall be released upon delivery. ".repeat(12)}`.trim();
    const quote = trimQuote(text);
    expect(text.startsWith(quote)).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(640);
    expect(quote.endsWith(".")).toBe(true);
  });
});

describe("isQuotable", () => {
  it("rejects a bare heading and a fax header, keeps a sentence", () => {
    expect(isQuotable("9. Conditions to Agent’s Consent.")).toBe(false);
    expect(
      isQuotable(
        "bet Bee FEB. 27, 2009 12:56PM GD&C LA NO. 7299 P. 4 GIBSON, DUNN & CRUTCHER LLP BlackRock Granite",
      ),
    ).toBe(false);
    expect(
      isQuotable(
        "Tenant is currently investigating and may dispute Landlord's assertion that Tenant is financially responsible for the repair.",
      ),
    ).toBe(true);
  });
});
