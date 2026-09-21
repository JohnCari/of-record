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
