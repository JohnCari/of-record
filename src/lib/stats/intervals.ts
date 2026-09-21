/**
 * Wilson score interval for a binomial proportion. Used instead of the normal approximation
 * because these samples are small and the rates sit near 0 or 1, which is exactly where the
 * normal interval collapses to zero width and claims a certainty the data cannot support.
 */
export function wilson(
  successes: number,
  n: number,
  z = 1.96,
): { rate: number; low: number; high: number } {
  if (n === 0) return { rate: 0, low: 0, high: 1 };
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { rate: p, low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

/**
 * The "rule of three": with zero failures in n trials, the 95% upper bound on the true failure
 * rate is about 3/n. Zero misses in 36 rows does not mean a zero miss rate.
 */
export function ruleOfThree(n: number): number {
  return n === 0 ? 1 : Math.min(1, 3 / n);
}
