import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

/** The stages a run goes through, in order. Progress is by stage; there is no finer signal. */
const STAGES = ["Reading", "Finding", "Writing", "Checking", "Dropping"];

export function isRunning(draft: Doc<"drafts"> | null): boolean {
  return draft?.status === "drafting" || draft?.status === "verifying";
}

/** One button. While a draft is in progress, the latest step is shown beside it in plain words. */
export function RunControl({
  draft,
  matterId,
  onStarted,
}: {
  draft: Doc<"drafts"> | null;
  matterId: string | null;
  onStarted: (draftId: Id<"drafts">) => void;
}) {
  const [starting, setStarting] = useState(false);
  const running = isRunning(draft);

  async function start() {
    setStarting(true);
    const response = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matterId }),
    });
    setStarting(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "The draft did not start.");
      return;
    }
    onStarted(body.draftId);
  }

  return (
    <Button size="sm" onClick={start} disabled={!matterId || starting || running}>
      {running || starting ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Play aria-hidden />
      )}
      {running || starting ? "Drafting" : "Draft the motion"}
    </Button>
  );
}

/** A slim bar under the header while a run is in progress, with the current step in words. */
export function RunProgress({ draft, events }: { draft: Doc<"drafts">; events: Doc<"events">[] }) {
  if (!isRunning(draft)) return null;
  const stages = events.filter((e) => e.type === "stage");
  const latest = stages.at(-1)?.label ?? "Starting";
  const index = STAGES.findIndex((word) => latest.startsWith(word));
  const value = index < 0 ? 5 : Math.min(95, 20 * (index + 1));
  return (
    <div className="flex items-center gap-3 border-b bg-card px-4 py-2" aria-live="polite">
      <Progress value={value} className="h-1.5 max-w-xs" />
      <p className="truncate text-sm text-muted-foreground">
        {latest}. <span className="hidden sm:inline">About half a minute in all.</span>
      </p>
    </div>
  );
}
