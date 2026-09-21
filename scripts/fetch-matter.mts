// Builds knowledge/matter/ from real court filings in CourtListener's RECAP archive.
// The list of filings is knowledge/matter.manifest.json, curated by reading each one. The text is
// written as retrieved: page stamps are removed and the page number kept, nothing else changes.
//   pnpm matter          then: pnpm seed
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { passagesFromFiling } from "../src/lib/courtlistener/filing";

type ManifestDoc = {
  recapId: number;
  entry: number;
  attachment: number | null;
  kind: string;
  title: string;
  filedAs: string;
  filed: string;
  pages: number;
  url: string;
};
type Manifest = {
  matter: {
    matterId: string;
    caption: string;
    court: string;
    docketNumber: string;
    docketUrl: string;
  };
  documents: ManifestDoc[];
};

const root = process.cwd();
const manifest = JSON.parse(
  await readFile(join(root, "knowledge/matter.manifest.json"), "utf8"),
) as Manifest;
const token = process.env.COURTLISTENER_TOKEN;
const cacheDir = join(root, ".cache/recap");
const outDir = join(root, "knowledge/matter");
await mkdir(cacheDir, { recursive: true });
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// CourtListener throttles this endpoint hard, so a response is fetched once and kept.
async function filing(
  doc: ManifestDoc,
): Promise<{ plain_text?: string; ocr_status?: number } | null> {
  const cached = join(cacheDir, `${doc.recapId}.json`);
  if (existsSync(cached)) return JSON.parse(await readFile(cached, "utf8"));
  if (!token) return null;
  const response = await fetch(
    `https://www.courtlistener.com/api/rest/v4/recap-documents/${doc.recapId}/?format=json`,
    {
      headers: { authorization: `Token ${token}` },
    },
  );
  if (!response.ok) return null;
  const body = await response.json();
  await writeFile(cached, JSON.stringify(body));
  return body;
}

const q = (value: string) => JSON.stringify(value);
const retrieved = new Date().toISOString();
const { matter } = manifest;
const index: string[] = [];
const skipped: string[] = [];

for (const doc of manifest.documents) {
  const number = doc.attachment ? `${doc.entry}-${doc.attachment}` : `${doc.entry}`;
  const body = await filing(doc);
  if (!body?.plain_text) {
    skipped.push(`Doc. ${number}: ${doc.title}`);
    continue;
  }
  const passages = passagesFromFiling(body.plain_text);
  if (passages.length === 0) {
    skipped.push(`Doc. ${number}: no readable text`);
    continue;
  }

  const pages = new Map<string, string[]>();
  for (const passage of passages)
    pages.set(passage.section, [...(pages.get(passage.section) ?? []), passage.text]);

  const file = `doc-${number}.md`;
  await writeFile(
    join(outDir, file),
    `---
type: Record Document
title: ${q(`Doc. ${number}: ${doc.title}`)}
description: ${q(`${doc.filedAs}, filed ${doc.filed} in ${matter.caption}, No. ${matter.docketNumber}.`)}
tags: [record, ${doc.kind}]
status: stable
doc_id: doc-${number}
docket_entry: ${doc.entry}
attachment: ${doc.attachment ?? "null"}
doc_kind: ${doc.kind}
filed: ${q(doc.filed)}
pages: ${doc.pages}
text_source: ${body.ocr_status === 1 ? "ocr" : "native"}
resource: ${doc.url}
generated: { by: process:fetch-matter, at: ${retrieved} }
sources:
  - id: recap
    resource: ${doc.url}
    title: CourtListener RECAP archive, Free Law Project
    last_modified: ${retrieved}
---

# Doc. ${number}: ${doc.title}

> Public court filing, reproduced as retrieved from CourtListener on ${retrieved.slice(0, 10)}. Not edited.${body.ocr_status === 1 ? " This filing was scanned, so its text comes from optical character recognition and contains recognition errors." : ""}

${[...pages].map(([section, texts]) => `## ${section}\n\n${texts.join("\n\n")}`).join("\n\n")}
`,
  );
  index.push(`* [Doc. ${number}: ${doc.title}](${file}) - ${doc.filedAs}`);
  console.log(
    `kept     Doc. ${number.padEnd(6)} ${String(passages.length).padStart(3)} passages  ${doc.title}`,
  );
}

await writeFile(
  join(outDir, "matter.md"),
  `---
type: Matter
title: ${q(matter.caption)}
description: ${q(`A contract dispute over $650,000 held in escrow after the sale of a commercial property in Aurora, Colorado. ${matter.court}, No. ${matter.docketNumber}.`)}
tags: [matter, colorado, contract, escrow]
status: stable
matter_id: ${matter.matterId}
forum: ${q(`${matter.court}, No. ${matter.docketNumber}`)}
client: ${q("Granite Southlands Town Center, LLC (plaintiff)")}
resource: ${matter.docketUrl}
generated: { by: process:fetch-matter, at: ${retrieved} }
---

# ${matter.caption}

> A real case. Every document here is a public filing retrieved from CourtListener's RECAP archive. This project is not affiliated with any party or lawyer in it, and nothing here is legal advice.

Granite bought a shopping centre in Aurora, Colorado from Alberta. Under a Release and Termination
Agreement, $650,000 of the price went into escrow, to be released to Alberta once it delivered
tenant estoppel certificates in the agreed form. Two tenants returned certificates that disclosed a
structural settlement problem. Both sides claimed the money, and the escrow agent released it to
neither.

## The drafting task

Draft Granite's motion for summary judgment that it is entitled to the escrowed funds. The court's
own orders and the parties' briefs are deliberately not in this record: they are the answer key
the test set is checked against, and a drafter that could read them would be copying.

${index.join("\n")}
`,
);

for (const line of skipped) console.log(`skipped  ${line}`);
console.log(
  `\n${index.length} filings written to knowledge/matter, ${skipped.length} skipped. Run pnpm seed.`,
);
