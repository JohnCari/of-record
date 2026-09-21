// One-off live check of the verifier against the real record and the real Jev model.
import { join } from "node:path";
import { createJevJudge } from "../src/lib/verify/judge";
import { okfRecordStore } from "../src/lib/verify/okf-record";
import type { DraftSentence } from "../src/lib/verify/types";
import { verifySentences } from "../src/lib/verify/verify";

const f = (
  id: string,
  text: string,
  docId: string,
  quote: string,
): DraftSentence => ({
  id,
  text,
  kind: "fact",
  recordCites: [{ docId, quote }],
  authorityCites: [],
});

const sentences: DraftSentence[] = [
  f(
    "true-1",
    "Tumbleweed Ridge sent no written notice rejecting any goods before April 22, 2025.",
    "ex-d",
    "April 22 was the first time we put anything in writing",
  ),
  f(
    "true-2",
    "The Agreement required payment of each invoice within thirty days of the invoice date.",
    "ex-a",
    "Buyer shall pay each invoice in full within thirty (30) days after the invoice date",
  ),
  f(
    "true-3",
    "In March 2025, Tumbleweed Ridge's director of operations admitted in writing that the company owed the money.",
    "ex-c",
    "We owe you the money and we will pay it",
  ),
  f(
    "wrong-amount",
    "The unpaid principal balance is $172,550.00.",
    "ex-b",
    "Unpaid principal balance as of the date of this ledger: $127,550.00",
  ),
  f(
    "planted",
    "Tumbleweed Ridge rejected the goods in writing on March 3, 2025.",
    "ex-d",
    "we rejected the frames in writing on March 3",
  ),
  f(
    "real-quote-wrong-claim",
    "Tumbleweed Ridge returned the defective frames to Cottonwood Gulch.",
    "ex-d",
    "We put them in the stores. Most of them are still in use",
  ),
  f(
    "overreach",
    "Every frame in the March shipment had defective coating.",
    "ex-d",
    "Our managers estimated somewhere around sixty, all from the March shipment",
  ),
  {
    id: "dodge",
    text: "Tumbleweed Ridge inspected and approved every frame on delivery.",
    kind: "argument",
    recordCites: [],
    authorityCites: [],
  },
  {
    id: "pure-argument",
    text: "For these reasons, the Court should grant summary judgment.",
    kind: "argument",
    recordCites: [],
    authorityCites: [],
  },
];

const judge = createJevJudge();
const t0 = Date.now();
const out = await verifySentences(sentences, {
  record: await okfRecordStore(join(process.cwd(), "knowledge")),
  authorities: { resolve: async () => ({ status: "not_found" }) },
  judge,
});
console.log(`${Date.now() - t0} ms, ${JSON.stringify(judge.usage)}\n`);
for (const v of out) {
  console.log(
    `${v.status.toUpperCase().padEnd(9)} ${v.sentenceId.padEnd(24)} kind ${v.declaredKind}->${v.effectiveKind}`,
  );
  for (const c of v.checks)
    console.log(`          [${c.stage}] ${c.verdict}: ${c.reason}`);
}
