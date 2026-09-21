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
| TypeScript | 5.9 | Type checking only. Next.js and tsx do the compiling | `tsconfig.json` | `pnpm typecheck` |
| Biome | 2.4 | Lint and format, one tool in place of eslint and prettier. shadcn's generated components are formatted but not linted | `biome.json` | `pnpm lint`, `pnpm format` |
| vitest | 5.0 | Unit tests, including the bench dataset's integrity tests | none, default globs | `pnpm test` |
| tsx | 4.23 | Runs the TypeScript scripts and the bench directly | none | `pnpm bench` |

## Product libraries

| Tool | Version | Job | Used in |
| --- | --- | --- | --- |
| Next.js | 16.3 | The app, the route handlers, and the host for the eve agent through `withEve` | `src/app`, `next.config.ts` |
| React | 19.2 | UI | `src/components` |
| shadcn/ui + Tailwind CSS | CLI 4.21 / 4.3 | Every interface surface. Components are source in the repo, themed through CSS variables | `src/components/ui`, `src/app/globals.css` |
| eve | 0.63 | The agentic lane: file-per-tool agent, approval policies, durable sessions, cost limits, `useEveAgent` | `agent/` |
| AI SDK (`ai`) | 7.0 | `generateText` with structured output for the deterministic lane; `experimental_evaluate` for Jev | `src/lib/pipeline`, `src/lib/verify/judge.ts` |
| Vercel AI Gateway | | One key and one budget for `google/gemini-3.8-flash` (drafter) and `typesafe-ai/jev` (judge) | `AI_GATEWAY_API_KEY` |
| Convex | 1.46 | Reactive state for drafts, sentences, verifications and attorney decisions; full-text search over passages; the transactional gate check on sign-off | `convex/` |
| `@convex-dev/rate-limiter` | 0.4 | A global daily ceiling on live pipeline runs | `convex/limits.ts` |
| zod | 4.6 | One sentence schema shared by the agent's tools, the pipeline's structured output and the verifier | `src/lib/verify/types.ts` |
| yaml | 2.9 | Open Knowledge Format frontmatter | `src/lib/okf` |
| CourtListener REST v4 | | Real opinions, search, and citation lookup. Called with `fetch`; no SDK | `src/lib/courtlistener` |
| recharts (through shadcn `chart`) | | The threshold sweep on the Quality page | `src/components/quality` |
| react-markdown | 10.1 | Renders the associate's replies | `src/components/workspace` |

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
| Make | Six pnpm scripts do not need aliases |
| `@typesafe-ai/sdk` | Jev is on the AI Gateway as `typesafe-ai/jev`, so one key covers both models and spend is capped in one place |

## What is deliberately not in the stack

- A vector database or embeddings. The record fits in context for extraction, and for search the
  combination of lexical recall and a judge that answers "does this passage establish the point"
  did the job. Embeddings would be the next thing to try on a real, large file, and the bench is
  how to find out whether they help.
- A generative model as judge. See the README.
- LangChain or a similar orchestration layer. The deterministic lane is about 250 lines of ordinary
  code, which is easier to read, test and change than a framework's abstraction of it.
