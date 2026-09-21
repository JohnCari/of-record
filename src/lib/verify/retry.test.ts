import { describe, expect, it } from "vitest";
import { isTransient, withRetry } from "./retry";

const noSleep = { sleep: async () => {} };

describe("withRetry", () => {
  it("rides out a brief outage", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw { statusCode: 503, isRetryable: true };
      return "ok";
    }, noSleep);
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the configured attempts and surfaces the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { statusCode: 503 };
        },
        { attempts: 4, ...noSleep },
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(calls).toBe(4);
  });

  it("does not retry a request that is simply wrong, or one that was cancelled", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw { statusCode: 400 };
      }, noSleep),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(calls).toBe(1);
    expect(isTransient({ name: "AbortError", statusCode: 503 })).toBe(false);
  });

  it("sees through the SDK's retry wrapper to the underlying failure", () => {
    expect(
      isTransient({ name: "AI_RetryError", lastError: { statusCode: 503, isRetryable: true } }),
    ).toBe(true);
  });
});
