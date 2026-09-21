// Fetches real Colorado opinions from CourtListener into knowledge/authorities/ as OKF documents.
// Nothing here is written by hand or by a model: the text is what CourtListener returns.
//   pnpm authorities          then: pnpm seed
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCourtListener, opinionPassages } from "../src/lib/courtlistener/client";
import { caseNameMatch, NAME_MATCH } from "../src/lib/verify/sources";

const token = process.env.COURTLISTENER_TOKEN;
if (!token) {
  console.error("COURTLISTENER_TOKEN is not set. Opinion text is not available anonymously.");
  process.exit(1);
}

// Leads, not facts. Each was written from memory, which is exactly what the drafting agent is
// forbidden to rely on, so each is held to the agent's rule: the citation must resolve to exactly
// one case and the resolved name must match. A lead that fails is dropped and reported.
const LEADS = [
  // The forum is federal, so the summary judgment standard comes from the Supreme Court and the
  // Tenth Circuit. Colorado law governs the contract, so the contract cases are Colorado's.
  {
    topic: "summary-judgment-standard",
    caseName: "Celotex Corp. v. Catrett",
    citation: "477 U.S. 317",
  },
  {
    topic: "summary-judgment-standard",
    caseName: "Anderson v. Liberty Lobby, Inc.",
    citation: "477 U.S. 242",
  },
  {
    topic: "nonmoving-party-burden",
    caseName: "Matsushita Electric Industrial Co. v. Zenith Radio Corp.",
    citation: "475 U.S. 574",
  },
  {
    topic: "nonmoving-party-burden",
    caseName: "Adler v. Wal-Mart Stores, Inc.",
    citation: "144 F.3d 664",
  },
  {
    topic: "summary-judgment-standard",
    caseName: "Churchey v. Adolph Coors Co.",
    citation: "759 P.2d 1336",
  },
  {
    topic: "summary-judgment-standard",
    caseName: "Westin Operator, LLC v. Groh",
    citation: "347 P.3d 606",
  },
  {
    topic: "nonmoving-party-burden",
    caseName: "Continental Air Lines, Inc. v. Keenan",
    citation: "731 P.2d 708",
  },
  {
    topic: "nonmoving-party-burden",
    caseName: "Civil Service Commission v. Pinder",
    citation: "812 P.2d 645",
  },
  {
    topic: "breach-of-contract-elements",
    caseName: "Western Distributing Co. v. Diodosio",
    citation: "841 P.2d 1053",
  },
  {
    topic: "contract-interpretation",
    caseName: "Ad Two, Inc. v. City & County of Denver",
    citation: "9 P.3d 373",
  },
  {
    topic: "contract-interpretation",
    caseName: "USI Properties East, Inc. v. Simpson",
    citation: "938 P.2d 168",
  },
];

// Searches fill topics the leads do not cover. Ordered by how often a case is cited, because
// relevance ranking surfaced opinions that merely recite the standard in passing.
const SEARCHES = [
  {
    topic: "acceptance-of-goods",
    q: '"acceptance" goods "rejection" "reasonable time" "Uniform Commercial Code"',
  },
  {
    topic: "breach-of-contract-elements",
    q: '"breach of contract" "elements" "performance by the plaintiff" "failure to perform"',
  },
  {
    topic: "summary-judgment-standard",
    q: '"summary judgment" "genuine issue" "material fact" "drastic remedy"',
  },
];
const COLORADO = "colo coloctapp";
const PER_SEARCH = 2;
const RANK = ["lead-opinion", "majority-opinion", "combined-opinion", "unanimous-opinion"];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cl = createCourtListener({ token });
const dir = join(process.cwd(), "knowledge/authorities");
await mkdir(dir, { recursive: true });

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const seen = new Set<number>();
const index: string[] = [];
const dropped: string[] = [];

async function save(entry: {
  topic: string;
  clusterId: number;
  caseName: string;
  citation: string;
  url: string;
  court: string;
  dateFiled: string;
  opinionIds: number[];
  how: string;
}): Promise<boolean> {
  if (seen.has(entry.clusterId)) return false;
  const opinions = [];
  for (const id of entry.opinionIds) {
    opinions.push(await cl.opinionText(id).catch(() => null));
    await pause(700);
  }
  const best = opinions
    .filter((o): o is { type: string; text: string } => o !== null && o.text.length > 0)
    .sort((a, b) => rank(a.type) - rank(b.type))[0];
  const passages = best ? opinionPassages(best.text) : [];
  if (!best || passages.length < 5) {
    dropped.push(`${entry.caseName}, ${entry.citation}: no usable opinion text`);
    return false;
  }

  seen.add(entry.clusterId);
  const file = `${slug(entry.caseName)}.md`;
  const retrieved = new Date().toISOString();
  const q = (value: string) => JSON.stringify(value);
  await writeFile(
    join(dir, file),
    `---
type: Authority
title: ${q(entry.caseName)}
description: ${q(`Colorado appellate opinion retrieved from CourtListener for the topic "${entry.topic}".`)}
tags: [authority, colorado, ${entry.topic}]
status: stable
authority_id: cl-${entry.clusterId}
citation: ${q(entry.citation)}
court: ${q(entry.court)}
date_filed: ${q(entry.dateFiled)}
opinion_type: ${q(best.type)}
selected_by: ${q(entry.how)}
doc_kind: opinion
resource: ${entry.url}
generated: { by: process:fetch-authorities, at: ${retrieved} }
sources:
  - id: courtlistener
    resource: ${entry.url}
    title: CourtListener, Free Law Project
    last_modified: ${retrieved}
---

# ${entry.caseName}

> Public-domain court opinion, reproduced as retrieved from CourtListener on ${retrieved.slice(0, 10)}. Not edited.

${passages.map((p) => p.text).join("\n\n")}
`,
  );
  index.push(`* [${entry.caseName}](${file}) - ${entry.citation}, ${entry.topic}`);
  console.log(
    `kept     ${entry.caseName}, ${entry.citation} (${passages.length} paragraphs, ${entry.topic})`,
  );
  return true;
}

for (const lead of LEADS) {
  // CourtListener throttles hard. An opinion already on disk is kept rather than fetched again.
  const existing = join(dir, `${slug(lead.caseName)}.md`);
  if (existsSync(existing)) {
    index.push(`* [${lead.caseName}](${slug(lead.caseName)}.md) - ${lead.citation}, ${lead.topic}`);
    console.log(`on disk  ${lead.caseName}, ${lead.citation}`);
    continue;
  }
  const [result] = await cl.lookup(lead.citation);
  await pause(1200);
  if (result?.status !== 200 || result.clusters.length !== 1) {
    dropped.push(`${lead.caseName}, ${lead.citation}: lookup status ${result?.status ?? "none"}`);
    continue;
  }
  const [cluster] = result.clusters;
  if (caseNameMatch(lead.caseName, cluster.caseName) < NAME_MATCH) {
    dropped.push(`${lead.caseName}, ${lead.citation}: that citation is ${cluster.caseName}`);
    continue;
  }
  await save({
    topic: lead.topic,
    clusterId: cluster.id,
    caseName: cluster.caseName,
    citation: result.normalized[0] ?? lead.citation,
    url: cluster.url,
    court: "Colorado",
    dateFiled: "",
    opinionIds: cluster.opinionIds,
    how: "lead verified by citation lookup and name match",
  });
}

for (const { topic, q } of process.argv.includes("--search") ? SEARCHES : []) {
  const hits = await cl.search(q, { court: COLORADO, limit: 8, orderBy: "citeCount desc" });
  await pause(1200);
  let kept = 0;
  for (const hit of hits) {
    // A caption that runs to a paragraph is a sign of an unusual procedural posture; skip it.
    if (kept >= PER_SEARCH || !hit.citations[0] || hit.caseName.length > 70) continue;
    const ok = await save({
      topic,
      clusterId: hit.clusterId,
      caseName: hit.caseName,
      citation: hit.citations[0],
      url: hit.url,
      court: hit.court,
      dateFiled: hit.dateFiled,
      opinionIds: hit.opinionIds,
      how: `search ordered by citation count: ${q}`,
    });
    if (ok) kept += 1;
  }
}

// The index lists everything on disk, including opinions kept from earlier runs.
const listed: string[] = [];
for (const file of (await readdir(dir))
  .filter((f) => f.endsWith(".md") && f !== "index.md")
  .sort()) {
  const text = await readFile(join(dir, file), "utf8");
  const title = text.match(/^title: "(.*)"$/m)?.[1] ?? file;
  const citation = text.match(/^citation: "(.*)"$/m)?.[1] ?? "";
  listed.push(`* [${title}](${file}) - ${citation}`);
}
await writeFile(join(dir, "index.md"), `# Authorities\n\n${listed.join("\n")}\n`);
for (const line of dropped) console.log(`dropped  ${line}`);
console.log(
  `\n${listed.length} opinions on disk; ${index.length} handled this run to knowledge/authorities, ${dropped.length} dropped. Run pnpm seed to load them.`,
);

function rank(type: string): number {
  const at = RANK.findIndex((name) => type.includes(name));
  return at === -1 ? RANK.length : at;
}
