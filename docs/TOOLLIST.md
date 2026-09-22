# Tool list

This list started from the toolchain of a production monorepo (pnpm workspaces, Turborepo, an MCP
server, Stripe billing, a published npm package) and was cut down to what a single-package demo
needs. Versions are the ones in the lockfile on the day it was built, 2026-09-21.

## Runtime and package management

| Tool | Version | Job | Where it is configured | Daily command |
| --- | --- | --- | --- | --- |
| Node.js | 24 LTS | The only runtime: Next.js, the eve agent, scripts, tests, the bench | `@types/node` held to the 24 line | `node --import tsx scripts/seed.mts` |
| pnpm | 12.4 | Install and lockfile. No install script runs unless listed | `packageManager` in `package.json`, `allowBuilds` in `pnpm-workspace.yaml` | `pnpm install`, `pnpm <script>` |

## Build, test, lint

| Tool | Version | Job | Where it is configured | Daily command |
| --- | --- | --- | --- | --- |
| TypeScript | 7.0 | Type checking only. Next.js and tsx do the compiling | `tsconfig.json` | `pnpm typecheck` |
| Biome | 2.5 | Lint and format, one tool in place of eslint and prettier. shadcn's generated components are formatted but not linted | `biome.json` | `pnpm lint`, `pnpm format` |
| vitest | 5.0 | Unit tests, including the bench dataset's integrity tests | none, default globs | `pnpm test` |
| tsx | 4.23 | Runs the TypeScript scripts and the bench directly | none | `pnpm bench` |

## Product libraries

| Tool | Version | Job | Used in |
| --- | --- | --- | --- |
| Next.js | 16.3 | The app, the route handlers, and the host for the eve agent through `withEve` | `src/app`, `next.config.ts` |
| React | 19.3 | UI | `src/components` |
| shadcn/ui + Tailwind CSS | CLI 4.21 / 4.3 | Every interface surface. Components are source in the repo, themed through CSS variables | `src/components/ui`, `src/app/globals.css` |
| eve | 0.63 | The agent lane, its evals and the lane comparison: file-per-tool agent, approval policies, durable sessions, cost limits. Kept in the repo and measured; not shown in the app | `agent/`, `evals/` |
| AI SDK (`ai`) | 7.0 | `experimental_evaluate` for every Jev call: selecting facts and rules, reranking, verifying. `generateText` with structured output for the few application sentences Gemini writes | `src/lib/pipeline`, `src/lib/verify/judge.ts` |
| Vercel AI Gateway | | One key and one budget for `typesafe-ai/jev` (selects and judges) and `google/gemini-3.8-flash` (the agent, and the application sentences). `pnpm jev:check` is a smoke test of Jev through the gateway | `AI_GATEWAY_API_KEY` |
| Convex | 1.46 | Reactive state for drafts, sentences, verifications and attorney decisions; full-text search over passages; the transactional gate check on sign-off | `convex/` |
| `@convex-dev/rate-limiter` | 0.4 | A global daily ceiling on live drafting runs | `convex/limits.ts` |
| zod | 4.6 | One sentence schema shared by the agent's tools, the pipeline's structured output and the verifier | `src/lib/verify/types.ts` |
| yaml | 2.9 | Open Knowledge Format frontmatter | `src/lib/okf` |
| CourtListener REST v4 | | The only source of data: the case file (RECAP filings), the opinions, search, and citation lookup. Called with `fetch`; no SDK. Throttled hard, so responses are cached and both lanes search the committed corpus first | `src/lib/courtlistener`, `scripts/fetch-matter.mts`, `scripts/fetch-authorities.mts` |

## Automation

| Tool | Job | Where |
| --- | --- | --- |
| GitHub Actions | On every push and pull request: install, lint, typecheck, test, and the bench gate against committed results | `.github/workflows/ci.yml` |
| Dependabot | Monthly grouped updates for npm and for the actions | `.github/dependabot.yml` |
| Vercel | Hosts the app and the agent as one project; Convex is provisioned through the Vercel Marketplace | `vercel link`, `vercel integration add convex` |

## What was dropped from the original list, and why

| Dropped | Why |
| --- | --- |
| Turborepo, pnpm workspaces | One package. There is no task graph to order or cache |
| esbuild as a direct tool, `npm publish` | Nothing is bundled for distribution or published |
| MCP TypeScript SDK, `mcp-handler` | This is an application, not an MCP server |
| Stripe SDK | No billing |
| Convex Auth | No accounts. Access to the live lanes is a signed invite cookie |
| Orama | Convex's search index gives lexical recall and stays reactive; Jev does the reranking |
| Make | A dozen pnpm scripts do not need aliases |
| `next-themes`, the shadcn sidebar | One light theme and one slim header. A demo someone opens for two minutes does not need navigation chrome |
| `@typesafe-ai/sdk` | Jev is on the AI Gateway as `typesafe-ai/jev`, so one key covers both models and spend is capped in one place. It has a single provider behind the gateway and returned one 503 under burst load, so every call retries with backoff. The direct SDK is the fallback if that ever stops being enough |

## What is deliberately not in the stack

- A vector database or embeddings. Jev reads every passage of the record for a fraction of a cent,
  so nothing has to be retrieved before it is judged, and for search the combination of lexical
  recall and a judge that answers "does this passage establish the point" did the job. Embeddings would be the next thing to try on a real, large file, and the bench is
  how to find out whether they help.
- A generative model as judge. See the README.
- LangChain or a similar orchestration layer. The Jev-first lane is about 300 lines of ordinary
  code, which is easier to read, test and change than a framework's abstraction of it.
