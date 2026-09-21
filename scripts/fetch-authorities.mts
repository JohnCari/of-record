// Fetches real Colorado opinions from CourtListener into knowledge/authorities/ as OKF documents.
// Nothing here is written by hand or by a model: the text is what CourtListener returns.
//   pnpm authorities          then: pnpm seed
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCourtListener, opinionPassages } from "../src/lib/courtlistener/client";

const token = process.env.COURTLISTENER_TOKEN;
if (!token) {
  console.error("COURTLISTENER_TOKEN is not set. Opinion text is not available anonymously.");
  process.exit(1);
}

// What the motion needs authority for. Each query is a lead; the verifier still checks every cite.
const QUERIES = [
  {
    topic: "summary-judgment-standard",
    q: '"summary judgment" "genuine issue" "material fact" "drastic remedy"',
  },
  {
    topic: "nonmoving-party-burden",
    q: '"summary judgment" "nonmoving party" "specific facts" "genuine issue for trial"',
  },
  {
    topic: "breach-of-contract-elements",
    q: '"breach of contract" elements "existence of a contract" "performance by the plaintiff"',
  },
  {
    topic: "acceptance-of-goods",
    q: '"acceptance of goods" "effective rejection" "reasonable opportunity to inspect"',
  },
  {
    topic: "contract-interpretation",
    q: '"unambiguous" contract "enforced as written" "plain meaning"',
  },
];
const COLORADO = "colo coloctapp";
const PER_QUERY = 4;
const RANK = ["lead-opinion", "majority-opinion", "combined-opinion", "unanimous-opinion"];

const cl = createCourtListener({ token });
const dir = join(process.cwd(), "knowledge/authorities");
await mkdir(dir, { recursive: true });

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const yamlString = (value: string) => JSON.stringify(value);
const seen = new Set<number>();
const index: string[] = [];

for (const { topic, q } of QUERIES) {
  const hits = await cl.search(q, { court: COLORADO, limit: PER_QUERY * 2 });
  let kept = 0;
  for (const hit of hits) {
    if (kept >= PER_QUERY || seen.has(hit.clusterId) || !hit.citations[0]) continue;
    const opinions = await Promise.all(
      hit.opinionIds.map((id) => cl.opinionText(id).catch(() => null)),
    );
    const best = opinions
      .filter((o): o is { type: string; text: string } => o !== null && o.text.length > 0)
      .sort((a, b) => rank(a.type) - rank(b.type))[0];
    if (!best) continue;
    const passages = opinionPassages(best.text);
    if (passages.length < 5) continue;

    seen.add(hit.clusterId);
    kept += 1;
    const file = `${slug(hit.caseName)}.md`;
    const retrieved = new Date().toISOString();
    await writeFile(
      join(dir, file),
      `---
type: Authority
title: ${yamlString(hit.caseName)}
description: ${yamlString(`${hit.court} opinion filed ${hit.dateFiled}, retrieved from CourtListener for the topic "${topic}".`)}
tags: [authority, colorado, ${topic}]
status: stable
authority_id: cl-${hit.clusterId}
citation: ${yamlString(hit.citations[0])}
all_citations: ${JSON.stringify(hit.citations)}
court: ${yamlString(hit.court)}
date_filed: ${yamlString(hit.dateFiled)}
opinion_type: ${yamlString(best.type)}
doc_kind: opinion
resource: ${hit.url}
generated: { by: process:fetch-authorities, at: ${retrieved} }
sources:
  - id: courtlistener
    resource: ${hit.url}
    title: CourtListener, Free Law Project
    last_modified: ${retrieved}
---

# ${hit.caseName}

> Public-domain court opinion, reproduced as retrieved from CourtListener on ${retrieved.slice(0, 10)}. Not edited.

${passages.map((p) => p.text).join("\n\n")}
`,
    );
    index.push(
      `* [${hit.caseName}](${file}) - ${hit.citations[0]}, ${hit.court} (${hit.dateFiled.slice(0, 4)}), ${topic}`,
    );
    console.log(`${topic}: ${hit.caseName}, ${hit.citations[0]} (${passages.length} paragraphs)`);
  }
}

await writeFile(join(dir, "index.md"), `# Authorities\n\n${index.join("\n")}\n`);
console.log(
  `\n${index.length} opinions written to knowledge/authorities. Run pnpm seed to load them.`,
);

function rank(type: string): number {
  const at = RANK.findIndex((name) => type.includes(name));
  return at === -1 ? RANK.length : at;
}
