# RossRecall

An AI assistant for litigation. It reads a real case file, drafts a motion, and checks every
sentence against the filing or the court opinion it cites before a lawyer sees it. Nothing can be
signed while any sentence is still open.

The name comes from *Suits*. Mike Ross never paraphrases from memory, he recalls the page. Neither
does this app. The facts and the law in a draft are **copied from the record word for word, not
written by an AI**. A writing model is used only for the few sentences that connect the facts to
the law, and those always go to the lawyer to decide.

**Live: [rossrecall.vercel.app](https://rossrecall.vercel.app)**. Drafting runs paid models, so it
needs an invite link. Without one you can still open the pages and read the signed drafts.

![The workspace: a motion for summary judgment on pleading paper, a mark beside every sentence, the real filing open at the quoted words.](docs/workspace.jpg)

This is a work sample by [Dariel Carrion](https://github.com/JohnCari). The case is real:
*Granite Southlands Town Center, LLC v. Alberta Town Center, LLC*, No. 1:09-cv-00799 (D. Colo.),
from public filings on CourtListener. This project is not affiliated with any party, lawyer or
company, and nothing in it is legal advice.

## What it promises

Not "it never hallucinates." Four narrower things, each of which can be checked:

1. **Most of the draft cannot be made up.** Every fact is a passage copied from a filing. Every
   legal rule is a paragraph copied from a real opinion. No writing model touches either.
2. **The rest is checked before a lawyer sees it.** The quote must really be in the document. The
   case must really exist. A judge model must agree the passage says what the sentence says, or
   admit it is not sure.
3. **Nothing can be signed while a sentence is open.** The lock is code, not a prompt. It is checked
   again at the moment of signing.
4. **How often the checker is wrong is measured and published**, with the uncertainty a small test
   set deserves.

## Two models, two jobs

**Jev picks.** [Jev](https://typesafe.ai), from Typesafe AI, cannot write. You give it a passage and
a claim, and it picks one answer from options you define and says how sure it is:

```ts
const result = await evaluate({
  model: "typesafe-ai/jev",
  state: { items: { c0: { claim, passage } } },
  questions: {
    c0: {
      type: "choice",
      instructions: "How does `items.c0.passage` relate to the claim in `items.c0.claim`?",
      criteria: {
        supports: "The passage states the claim or directly implies that it is true",
        contradicts: "The passage states the opposite of the claim or implies that it is false",
        says_nothing: "The passage does not address what the claim asserts, either way",
      },
    },
  },
});
// => { choice: "contradicts", probabilities: { supports: 0.01, contradicts: 0.99, says_nothing: 0 } }
```

Jev can pick the wrong option. It cannot invent a fact, a quote or a case, because there is nowhere
in that answer to put one. Its mistakes can be counted. A writing model's inventions cannot be
predicted. The confidence score is what lets the app act alone when Jev is sure and hand the
sentence to the lawyer when it is not.

**Gemini writes.** Gemini 3.8 Flash, from Google, writes only the sentences that apply the law to
the facts. It never types a quote or a citation. It points at numbered facts and rules, and code
attaches them. Every sentence it writes goes to the lawyer.

| Part of the motion | Who produces it | Can it contain an invented word? |
| --- | --- | --- |
| Statement of facts | Jev reads every passage of the record and says which point each one proves. Code quotes the best ones | No |
| Legal standard and rules | The app looks each case up on CourtListener. Jev picks the paragraph that states the rule. Code quotes it | No |
| Applying the law to the facts | Gemini writes one sentence per point | Yes, so it is checked and always goes to the lawyer |

Reading the whole record with Jev costs about a cent, so there is no search step in front of it
and no vector database. The points the motion must prove are plain data a lawyer can read and edit
([`src/lib/drafting/task.ts`](src/lib/drafting/task.ts)). The drafting code is in
[`src/lib/pipeline`](src/lib/pipeline).

## How a sentence is checked

Code does the cheap checks first, and a sentence that fails them never reaches a model:

- **A fact.** Is the quote really in the filing it cites, word for word? If not, it is blocked.
- **A rule.** Does the citation match exactly one real case with that name (CourtListener)? Is the
  quote really in the court's opinion? Does the opinion mention every rule number the sentence
  cites? If any answer is no, it is blocked.
- **Then Jev.** Does the passage support the sentence? Sure it does: verified. Sure it does not:
  blocked. Not sure: the lawyer decides.
- **Gemini's sentences.** Their facts and rules are checked as above, and then the sentence goes to
  the lawyer no matter what. Whether the conclusion follows is a lawyer's call.
- **Signing.** Allowed only when every sentence is verified, accepted or struck. Accepting or
  striking needs a written reason.

A few details that close loopholes:

- A drafter cannot dodge citing by labelling a fact "argument". Jev reads each sentence on its own
  and the stricter reading wins.
- If CourtListener is down, the sentence goes to the lawyer. An outage is never a pass and never a
  finding that the case is fake.
- A rule number ("Rule 56(c)") counts only if it appears in the opinion cited for it.
- Rules are quoted from the court's opinion, not from a dissent.
- Quotes must match exactly. A reworded quote is not a quote.

The checker lives in [`src/lib/verify`](src/lib/verify) and runs under unit tests with a scripted
judge.

## The case file is real

There is no mock data. Everything the app reads came from CourtListener: 24 filings from the
record and 16 court opinions.

*Granite v. Alberta* is a dispute over $650,000 held in escrow after the sale of a shopping
centre. The seller was to get the money once it delivered tenant estoppel certificates in the
agreed form. Two tenants returned certificates that disclosed a structural problem, and both sides
claimed the money. The record has the agreements, the letters, the certificates, affidavits and
deposition transcripts ([`knowledge/matter.manifest.json`](knowledge/matter.manifest.json)).

Two things follow:

- **The text is as filed.** Many filings are scans, so quotes carry the scanning errors of the
  source ("Eserow", "shal!"). Nothing is cleaned up, because a tidied quote is no longer a quote.
- **The court's own findings are the answer key, and the drafter never sees them.** The briefs and
  the court's final order (Doc. 195) are left out of the record. The order lives in
  [`bench/answer-key`](bench/answer-key) and is used only to label the test set.

## The numbers

[`bench/dataset/v0.2`](bench/dataset/v0.2) holds 73 test sentences written against the real
record. 26 are sound. 47 each carry one planted mistake of a known kind: a made-up quote, a real
quote cited to the wrong filing, a sentence that contradicts its quote, a case that does not exist,
a real case under another case's name, and so on. The set was split in half. The confidence
threshold was tuned on one half only. These numbers come from the other half, over three runs.

| Held-out half | Count | Rate | 95% interval |
| --- | --- | --- | --- |
| Bad sentences that got through | 0 of 19 | 0.0% | 0.0% to 16.8% |
| Sound sentences held back | 0 of 17 | 0.0% | 0.0% to 18.4% |
| Bad sentences blocked with no person involved | 17 of 19 | 89.5% | 68.6% to 97.1% |
| Sentences whose result changed between runs | 0 of 73 | | |

**Read the interval, not the zero.** Nineteen bad sentences cannot rule out a miss rate near 17%.
An earlier version of this test, on a different record, let 2 of 36 through. Both were the same
kind of mistake: a true quote accepted as proof of a conclusion it did not quite establish. That is
still the kind to watch.

**What these numbers do not show.** The test sentences were written and labelled by the engineer
who built the checker, not by a practising lawyer. One case, one court. The planted mistakes are
the ones I thought of. The CI gate (`pnpm bench:gate`) fails the build if the held-out counts get
worse. Reproduce with `pnpm bench`, about a fifth of a cent per run.

## Two ways to draft, one lock

The app uses a fixed sequence of steps: the same steps, in the same order, every time. An agent
version, where Gemini chooses its own path through ten tools, is kept in the repo
([`agent/`](agent), built on [eve](https://eve.dev)) so the two can be compared on equal terms.
Both sit behind the same checker and the same signing lock. The agent has no shell, no file system
and no web access, and its finish tool is refused in code while any sentence is open.

Same case, same instruction, eight runs each. Medians, with 95% intervals in brackets.
`pnpm bench:lanes`.

| Per run | Fixed steps (the app) | Agent | Jev only, no Gemini |
| --- | --- | --- | --- |
| Sentences in the motion | 28 [28 to 28] | 23 [18 to 32] | 24 [24 to 24] |
| Written by a writing model | 4 | 23 [18 to 32] | 0 |
| Cleared by the checker | 24 [23 to 24] | 18.5 [14.0 to 29.0] | 24 [23.5 to 24] |
| Waiting for the lawyer | 4 [4 to 5] | 3 [3 to 4] | 0 |
| Blocked at the end | 0 | 0 | 0 |
| Cost per run | $0.013 | $0.30 [$0.17 to $0.65] | $0.010 |
| Seconds per run | 29 [27 to 32] | 299 [176 to 449] | 21 [19 to 24] |

What this shows:

- **Gemini is needed for very little.** With it switched off, Jev still finds and checks every
  fact and every rule for about a cent. Gemini adds the four sentences a lawyer has to judge
  anyway.
- **The agent costs about eighteen times more and takes about nine times longer**, and its drafts
  vary in length from run to run. The fixed steps produced the same 28 sentences every time. That
  is why the app ships the fixed steps.
- **No run ended with a blocked sentence.** One agent run hit its $0.75 cost ceiling mid-way; the
  lock stayed closed and the run is counted, not dropped.

Eight runs can show a several-fold difference in cost. They say nothing about a different case.

## How the lock is tested

A guarantee that only ever held because the model happened to behave has not been tested.

| Test | What it proves | Command |
| --- | --- | --- |
| Unit tests | Every verdict, with a scripted judge: made-up quote, contradicted, fake case, wrong name, wrong rule, unsure, outage, relabelling. Test-set labels are checked against the record | `pnpm test` |
| Lock test | No model involved. A made-up sentence is written straight into a draft. Signing is refused, the sentence is blocked, signing is refused again, allowed once the lawyer strikes it, and the signed draft then refuses new text | `pnpm gate:integration` |
| Agent tests | Against the running agent, judged on what was stored, not on what the agent says: a planted instruction hidden in a document never reaches a cleared sentence, and a "lawyer" ordering a made-up quote never gets it cleared or signed | `pnpm eval` |

The planted instruction is the only invented document in the repo. It is a test fixture
([`evals/fixtures`](evals/fixtures)), added for one test run and removed again, never deployed.

## The stack

| Piece | Why it is here |
| --- | --- |
| **Jev** (Typesafe AI) | Picks passages and judges sentences. Cannot write. Says how sure it is |
| **Gemini 3.8 Flash** (Google) | Writes the few sentences that apply the law to the facts |
| **Vercel AI Gateway** | One key and one hard budget for both models |
| **Convex** | Stores drafts, checks and the lawyer's decisions. The browser sees changes live. Signing re-checks the lock inside one database transaction |
| **Next.js on Vercel** | The app and the agent in one deployment |
| **eve** | Runs the agent: one file per tool, cost limits, tests in the same repo |
| **shadcn/ui** | Every screen is built from its components |
| **CourtListener** | The filings, the opinions, and the citation lookup that catches invented cases |
| **TypeScript, Biome, vitest** | One language end to end |

The case file and the opinions are markdown files in [`knowledge/`](knowledge), one per document,
each with its CourtListener link and the date it was fetched. The full tool list is in
[`docs/TOOLLIST.md`](docs/TOOLLIST.md).

## Attaching your own case

The app also drafts for a case you attach: up to 10 PDF, Word (`.docx`) or `.txt` files, the case
name, the court, and one sentence on what the motion asks for. The browser reads the files itself
([`extract.ts`](src/lib/cases/extract.ts)) and sends only the text, so the files never leave your
machine and large court PDFs are fine. Scanned images without a text layer are refused. Gemini
then writes the outline of points the motion must prove, and from there the steps are the same as
for the prepared case. Attaching needs the invite link, has a daily limit, and unlocks once the
guided tour has been completed. The tour walks the prepared case step by step, pointing at the one
control to use next.

## Signed drafts

The **Signed drafts** page lists every signed motion with the counts of sentences the checker
cleared and the lawyer accepted or struck. A row reopens the draft read-only, and **Print** puts
the pleading alone on paper, line numbers and signature line included.

## Keeping a public demo safe

- Drafting needs the invite link. The link sets a signed cookie, and every route that spends money
  checks it.
- The browser never writes to the database directly. Every write goes through server code with a
  secret the browser never sees.
- The agent has a per-session cost ceiling, drafting has a daily limit, and the AI Gateway key has
  a hard budget.
- The agent has no shell, no file system and no web access.

## Run it

```bash
pnpm install
vercel link && vercel integration add convex   # Convex through the Vercel Marketplace
cp .env.example .env.local                      # then fill it in
pnpm exec convex env set SERVER_SECRET <the value in .env.local>
pnpm exec convex dev --once
pnpm seed                                       # load knowledge/ into Convex
pnpm dev                                        # Next.js and the eve agent together

pnpm test              # unit tests
pnpm bench             # the planted-mistake test set, live against Jev
pnpm bench:gate        # the quality gate CI runs
pnpm bench:lanes       # fixed steps vs agent (needs pnpm dev running)
pnpm gate:integration  # the signing lock, with no model involved
pnpm eval              # agent tests, against the running dev server
pnpm pipeline          # one draft from the command line; add -- --jev for no Gemini
pnpm jev:check         # ten-second check that Jev answers through the gateway
pnpm matter            # rebuild the case file from CourtListener (needs a token)
pnpm authorities       # fetch the opinions from CourtListener
```

### Deploying

`vercel.json` runs `convex deploy --cmd 'pnpm build'`, which pushes the Convex functions and puts
the Convex URL into the build. The agent reads that URL at runtime, so `NEXT_PUBLIC_CONVEX_URL`
must also be set as a Vercel environment variable. Set the production `SERVER_SECRET` in Convex
from the original value; `vercel env pull` does not reveal secrets.

## Limitations, and what comes next

- **No lawyer has labelled the test set.** The app stores every accept and strike with the
  sentence, the checker's verdict and the lawyer's reason, so real disagreements can become test
  rows.
- **One case.** The points to prove are written for this case. A second and third case, in other
  courts, would show whether the approach carries over.
- **The hardest mistake.** A true quote that does not quite prove the sentence. A second, narrower
  question to Jev ("does the passage state this, or would a reader have to infer it?") is the
  candidate fix, to be measured on held-out rows.
- **Scans.** A misread number in a scanned filing is quoted faithfully and wrongly. The lawyer sees
  the original one click away, but nothing flags it.
- **Prose.** A motion built from quotations is accurate and stiff. Nothing measures the writing yet.
- **Redacting personal data** before a model sees a record. This record is already public, so it
  was not needed here.
- This is TypeScript. The checker's design carries to Python unchanged.
