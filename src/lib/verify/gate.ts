import type { SentenceVerification } from "./types";

/** An attorney's decision on one sentence. Recorded, attributed, and reusable as a test-set label. */
export type Override = {
  sentenceId: string;
  decision: "accept" | "strike";
  by: string;
  reason: string;
};

export type GateResult =
  | {
      open: true;
      verified: number;
      exempt: number;
      accepted: number;
      struck: number;
    }
  | {
      open: false;
      blocking: {
        sentenceId: string;
        status: "blocked" | "review" | "unverified";
      }[];
    };

/**
 * The gate the drafting agent cannot argue with. A draft is finishable only when every sentence is
 * verified, exempt, or has been decided by a person. The agent chooses the path to get here; it
 * does not choose whether this holds.
 */
export function evaluateGate(
  sentenceIds: string[],
  verifications: SentenceVerification[],
  overrides: Override[],
): GateResult {
  const byId = new Map(verifications.map((v) => [v.sentenceId, v]));
  const decided = new Map(overrides.map((o) => [o.sentenceId, o]));
  const blocking: {
    sentenceId: string;
    status: "blocked" | "review" | "unverified";
  }[] = [];
  const counts = { verified: 0, exempt: 0, accepted: 0, struck: 0 };

  for (const sentenceId of sentenceIds) {
    const override = decided.get(sentenceId);
    if (override) {
      counts[override.decision === "accept" ? "accepted" : "struck"] += 1;
      continue;
    }
    const verification = byId.get(sentenceId);
    // A sentence nobody verified is the failure this whole system exists to prevent.
    if (!verification) blocking.push({ sentenceId, status: "unverified" });
    else if (verification.status === "blocked" || verification.status === "review") {
      blocking.push({ sentenceId, status: verification.status });
    } else counts[verification.status] += 1;
  }

  return blocking.length > 0 ? { open: false, blocking } : { open: true, ...counts };
}
