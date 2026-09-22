import { describe, expect, it } from "vitest";
import { inParts, isTransient, withRetry } from "./retry";

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

describe("inParts", () => {
  const invalid = Object.assign(new Error("did not select a highest-probability option"), {
    name: "AI_InvalidResponseDataError",
  });

  it("isolates the one question with a bad answer and gives it the fallback", async () => {
    const calls: number[][] = [];
    const ask = async (part: number[]) => {
      calls.push(part);
      if (part.includes(3)) throw invalid;
      return part.map((n) => `ok-${n}`);
    };
    const result = await inParts([1, 2, 3, 4, 5], ask, (n) => `skipped-${n}`);
    expect(result).toEqual(["ok-1", "ok-2", "skipped-3", "ok-4", "ok-5"]);
    expect(calls[0]).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not swallow other failures", async () => {
    await expect(
      inParts(
        [1, 2],
        async () => {
          throw new Error("boom");
        },
        () => "x",
      ),
    ).rejects.toThrow("boom");
  });
});
