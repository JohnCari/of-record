import { describe, expect, it } from "vitest";
import { ruleOfThree, wilson } from "./intervals";

describe("wilson", () => {
  it("matches a published value", () => {
    // 8 of 10: Wilson 95% interval is 0.490 to 0.943.
    const { low, high } = wilson(8, 10);
    expect(low).toBeCloseTo(0.49, 2);
    expect(high).toBeCloseTo(0.943, 2);
  });

  it("never reports certainty from a perfect small sample", () => {
    const { rate, low, high } = wilson(0, 36);
    expect(rate).toBe(0);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0.08);
    expect(high).toBeLessThan(0.11);
  });

  it("knows nothing about an empty sample", () => {
    expect(wilson(0, 0)).toEqual({ rate: 0, low: 0, high: 1 });
  });
});

describe("ruleOfThree", () => {
  it("bounds the miss rate after zero misses", () => {
    expect(ruleOfThree(36)).toBeCloseTo(0.083, 3);
  });
});
