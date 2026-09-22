import { CourtListenerError, createCourtListener } from "@/lib/courtlistener/client";
import { getBackend } from "@/lib/drafting/backend";
import { api } from "../../../convex/_generated/api";

/**
 * CourtListener clients for interactive requests. A person is waiting, so a throttled response
 * fails fast instead of sleeping through CourtListener's retry-after, and every call is capped at
 * twelve seconds. Search is a public endpoint with its own quota, so it is tried without the token
 * first; the token's quota is kept for what needs it.
 */
function interactive(token?: string) {
  return createCourtListener({
    token,
    sleep: async () => {
      throw new CourtListenerError(429, "CourtListener is throttling");
    },
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) }),
  });
}

const throttled = (error: unknown) =>
  (error instanceof CourtListenerError && error.status === 429) ||
  (error as { name?: string })?.name === "TimeoutError";

/** Runs the call anonymously, then with the token if the anonymous quota is spent, or vice versa. */
export async function withCourtListener<T>(
  call: (cl: ReturnType<typeof createCourtListener>) => Promise<T>,
  order: "anonymous-first" | "token-first" = "anonymous-first",
): Promise<T> {
  const token = process.env.COURTLISTENER_TOKEN || undefined;
  const clients = order === "anonymous-first" ? [undefined, token] : [token, undefined];
  let last: unknown;
  for (const t of clients) {
    try {
      return await call(interactive(t));
    } catch (error) {
      const refused = error instanceof CourtListenerError && [401, 403].includes(error.status);
      if (refused && last) break; // the fallback needs a token; the first failure is the real one
      last = error;
      if (!throttled(error)) throw error;
    }
  }
  throw last;
}

/** The reporter a brief would cite first: U.S., then the federal reporters, then regional. */
export function preferredCitation(citations: string[]): string[] {
  const rank = (c: string) =>
    /\bU\.S\.\s/.test(c)
      ? 0
      : /\bF\.(?: ?[234]d| Supp)/.test(c)
        ? 1
        : /\bP\.[23]d\b/.test(c)
          ? 2
          : 3;
  return [...citations].sort((a, b) => rank(a) - rank(b));
}

/** One global ceiling on live CourtListener calls, since search is open to anyone. */
export async function searchAllowed(): Promise<Response | null> {
  const backend = getBackend();
  const limit = await backend.convex.mutation(api.limits.takeSearch, { secret: backend.secret });
  if (limit.ok) return null;
  return Response.json(
    { error: "Too many searches right now. Try again in a minute." },
    { status: 429 },
  );
}

export function courtListenerFailure(error: unknown): Response {
  const status = error instanceof CourtListenerError ? error.status : 0;
  const timedOut = (error as { name?: string })?.name === "TimeoutError";
  return Response.json(
    {
      error:
        status === 429 || timedOut
          ? "CourtListener is busy right now. Use the link to open it there."
          : "CourtListener is not answering right now.",
    },
    { status: 503 },
  );
}
