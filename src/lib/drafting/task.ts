import type { Element } from "../pipeline/select";
import { MATTER_ID } from "./sections";

/**
 * What Granite has to show to be entitled to the escrowed funds. This is the one piece of
 * case-specific legal judgment in the pipeline, written down as data rather than buried in a
 * prompt, so an attorney can read it, disagree with it, and change it.
 */
export const ELEMENTS: Element[] = [
  {
    id: "agreement",
    label: "The parties' agreement",
    need: "The passage shows that Alberta and Granite made a written agreement about the sale or about releasing funds held in escrow, or states who the parties to it are",
  },
  {
    id: "condition",
    label: "What Alberta had to deliver",
    need: "The passage states what Alberta was required to deliver or do, such as tenant estoppel certificates, their required form or content, how many tenants or how much leased square footage they had to cover, or the deadline",
  },
  {
    id: "shortfall",
    label: "What was delivered, and what was wrong with it",
    need: "The passage states which estoppel certificates were or were not delivered, or that a certificate disclosed a problem such as structural settlement, a landlord default, or a dispute with the tenant",
  },
  {
    id: "objection",
    label: "Granite's objection",
    need: "The passage shows Granite or its representatives objecting to, rejecting, or raising concerns about estoppel certificates, or the parties communicating about whether the escrow should be released",
  },
];

/** The rules a motion of this kind has to state, and how to look for authority for each. */
export const RULES = [
  {
    id: "sj-standard",
    rule: "Summary judgment is appropriate when there is no genuine dispute as to any material fact and the moving party is entitled to judgment as a matter of law",
    query:
      "summary judgment no genuine issue material fact entitled to judgment as a matter of law",
  },
  {
    id: "sj-burden",
    rule: "Once the moving party shows the absence of a genuine issue of material fact, the nonmoving party must come forward with specific facts showing a genuine issue for trial",
    query: "summary judgment burden shifts nonmoving party specific facts genuine issue for trial",
  },
  {
    id: "plain-meaning",
    rule: "A written contract that is complete and unambiguous is enforced according to the plain meaning of its terms",
    query: "contract unambiguous enforced according to plain language intent of the parties",
  },
  {
    id: "contract-elements",
    rule: "The elements a party must prove to recover on a claim for breach of contract",
    query:
      "breach of contract elements existence of a contract performance failure to perform damages",
  },
] as const;

/** The prepared case, as seeded. Every other case comes from what a person attaches. */
export const PREPARED_MATTER = {
  matterId: MATTER_ID,
  caption: "Granite Southlands Town Center, LLC v. Alberta Town Center, LLC",
  court: "United States District Court for the District of Colorado",
  docketNumber: "No. 1:09-cv-00799",
  motionTitle: "Plaintiff's Motion for Summary Judgment",
  motion:
    "Granite moves for summary judgment that it, not Alberta, is entitled to the $650,000 held in escrow.",
  task: { elements: ELEMENTS, rules: RULES.map((r) => ({ ...r })) },
  prepared: true,
  url: "https://www.courtlistener.com/docket/4195314/granite-southlands-town-center-llc-v-alberta-town-center-llc/",
};

/** Every summary-judgment motion states these, whatever the case. */
export const STANDARD_RULES = RULES.filter((r) => r.id.startsWith("sj-")).map((r) => ({ ...r }));
