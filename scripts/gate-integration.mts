// Proves the gate without relying on any model behaving well. A fabricated sentence is written
// straight into a draft, as a compromised or careless drafter could, and the draft is then pushed
// at the verifier and at sign-off. Exits non-zero if either lets it through.
//   pnpm gate:integration
import { api } from "../convex/_generated/api";
import { getBackend, validateDraft } from "../src/lib/drafting/backend";
import { MATTER_ID } from "../src/lib/drafting/sections";

const backend = getBackend();
const { convex, secret } = backend;
const draftId = await convex.mutation(api.drafts.create, {
  secret,
  matterId: MATTER_ID,
  lane: "pipeline",
});

await convex.mutation(api.drafts.writeSection, {
  secret,
  draftId,
  sectionId: "facts",
  sectionOrder: 0,
  sentences: [
    {
      text: "The Escrow Agreement required the escrow agent to retain $650,000.00 out of the funds to be paid to the seller at closing.",
      kind: "fact",
      recordCites: [
        {
          docId: "doc-228-1",
          quote:
            'Escrow Agent shall retain an amount equal to $650,000.00 (the "Deposit") out of the Excess Funds to be paid to Seller at Closing',
        },
      ],
      authorityCites: [],
    },
    {
      text: "Mr. Cudlip stated that Granite waived its right to object to the estoppels.",
      kind: "fact",
      recordCites: [
        {
          docId: "doc-75-1",
          quote: "Granite waived any right to object to the tenant estoppel certificates",
        },
      ],
      authorityCites: [],
    },
  ],
});

const failures: string[] = [];

// 1. Signing before any verification has run must be refused.
const early = await convex.mutation(api.drafts.sign, { secret, draftId, by: "gate-integration" });
if (early.signed) failures.push("an unverified draft was signed");

// 2. The verifier must clear the sound sentence and block the fabricated one.
const summary = await validateDraft(backend, draftId);
if (summary.gate.open) failures.push("the gate opened with a fabricated sentence in the draft");
if (summary.counts.verified !== 1)
  failures.push(`expected 1 verified sentence, got ${summary.counts.verified}`);
if (summary.counts.blocked !== 1)
  failures.push(`expected 1 blocked sentence, got ${summary.counts.blocked}`);

// 3. Signing a verified draft that still holds a blocked sentence must be refused.
const late = await convex.mutation(api.drafts.sign, { secret, draftId, by: "gate-integration" });
if (late.signed) failures.push("a draft with a blocked sentence was signed");

// 4. Once a person strikes the sentence, with a reason, the same draft can be signed.
await convex.mutation(api.drafts.adjudicate, {
  secret,
  draftId,
  sentenceId: "facts-2",
  decision: "strike",
  by: "gate-integration",
  reason: "The quoted words are not in the affidavit.",
});
const final = await convex.mutation(api.drafts.sign, { secret, draftId, by: "gate-integration" });
if (!final.signed)
  failures.push("the draft could not be signed after the attorney struck the blocked sentence");

// 5. A signed draft must not accept new text.
const rewrite = await convex
  .mutation(api.drafts.writeSection, {
    secret,
    draftId,
    sectionId: "facts",
    sectionOrder: 0,
    sentences: [{ text: "x", kind: "argument", recordCites: [], authorityCites: [] }],
  })
  .then(
    () => "accepted",
    () => "refused",
  );
if (rewrite !== "refused") failures.push("a signed draft accepted new text");

if (failures.length > 0) {
  console.error("Gate integration: FAILED");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Gate integration: passed.");
console.log("  unverified draft          -> sign refused");
console.log("  fabricated sentence       -> blocked in code, gate closed");
console.log("  blocked sentence present  -> sign refused");
console.log("  attorney strikes it       -> sign accepted");
console.log("  signed draft              -> further writes refused");
