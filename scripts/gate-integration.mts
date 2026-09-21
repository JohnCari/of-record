// Proves the gate without relying on any model behaving well. A fabricated sentence is written
// straight into a draft, as a compromised or careless drafter could, and the draft is then pushed
// at the verifier and at sign-off. Exits non-zero if either lets it through.
//   pnpm gate:integration
import { api } from "../convex/_generated/api";
import { getBackend, MATTER_ID, validateDraft } from "../src/lib/drafting/backend";

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
      text: "Buyer shall pay each invoice in full within thirty days after the invoice date.",
      kind: "fact",
      recordCites: [
        {
          docId: "ex-a",
          quote:
            "Buyer shall pay each invoice in full within thirty (30) days after the invoice date.",
        },
      ],
      authorityCites: [],
    },
    {
      text: "Tumbleweed Ridge rejected the goods in writing on March 3, 2025.",
      kind: "fact",
      recordCites: [{ docId: "ex-d", quote: "we rejected the frames in writing on March 3" }],
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
  reason: "The quoted words are not in the deposition.",
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
