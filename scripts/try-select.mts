import { getBackend } from "../src/lib/drafting/backend";
import { ELEMENTS } from "../src/lib/drafting/task";
import { factSentence, recordCandidates, selectFacts } from "../src/lib/pipeline/select";

const backend = getBackend();
const usage = { requests: 0, inputTokens: 0, outputTokens: 0 };
const t0 = Date.now();
const candidates = await recordCandidates(backend);
const facts = await selectFacts(backend, ELEMENTS, { usage });
console.log(
  `${candidates.length} distinct passages read, ${facts.length} selected, ${Date.now() - t0} ms, ${JSON.stringify(usage)}, $${(usage.inputTokens * 0.042e-6).toFixed(4)}\n`,
);
for (const element of ELEMENTS) {
  console.log(`## ${element.label}`);
  for (const f of facts.filter((x) => x.elementId === element.id)) {
    console.log(
      `  [${f.probability.toFixed(2)}] ${factSentence(f).slice(0, 300)} (${f.docId.replace("doc-", "Doc. ")} at ${f.page.replace("Page ", "")}.)`,
    );
  }
}
