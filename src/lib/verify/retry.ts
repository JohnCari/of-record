/**
 * Retries a model call through transient failures. Jev has one provider behind the gateway and no
 * fallback, so a brief 503 would otherwise fail a whole verification run. Only failures the
 * provider marks retryable, rate limits and 5xx are retried; a bad request fails at once.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  options: { attempts?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { attempts = 5, sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } =
    options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      await sleep(2 ** (attempt - 1) * 1000);
    }
  }
}

export function isTransient(error: unknown): boolean {
  const e = error as {
    statusCode?: number;
    isRetryable?: boolean;
    lastError?: unknown;
    name?: string;
  };
  if (e?.name === "AbortError") return false;
  if (e?.lastError) return isTransient(e.lastError);
  if (e?.isRetryable === true) return true;
  return e?.statusCode === 429 || (typeof e?.statusCode === "number" && e.statusCode >= 500);
}

/** The SDK's name for a response it would not accept, e.g. a choice that is not its own top option. */
export function isInvalidAnswer(error: unknown): boolean {
  const e = error as { name?: string; lastError?: unknown };
  if (e?.lastError) return isInvalidAnswer(e.lastError);
  return typeof e?.name === "string" && e.name.includes("InvalidResponseData");
}

/**
 * Asks a batch of questions, and survives one bad answer in it. The SDK rejects a whole response
 * when a single answer is malformed, which Jev produces now and then when two options are nearly
 * tied. The batch is split until the bad question stands alone, and that one question gets the
 * fallback. Every fallback in this codebase is the cautious outcome: skip the passage, or send the
 * sentence to a person.
 */
export async function inParts<T, R>(
  items: T[],
  ask: (part: T[]) => Promise<R[]>,
  fallback: (item: T) => R,
): Promise<R[]> {
  try {
    return await ask(items);
  } catch (error) {
    if (!isInvalidAnswer(error)) throw error;
    if (items.length === 1) return [fallback(items[0])];
    const middle = Math.ceil(items.length / 2);
    return [
      ...(await inParts(items.slice(0, middle), ask, fallback)),
      ...(await inParts(items.slice(middle), ask, fallback)),
    ];
  }
}
