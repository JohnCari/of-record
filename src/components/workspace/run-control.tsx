import { Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

/** One button. While a draft is in progress, the latest step is shown beside it in plain words. */
export function RunControl({
  draft,
  events,
  onStarted,
}: {
  draft: Doc<"drafts"> | null;
  events: Doc<"events">[];
  onStarted: (draftId: Id<"drafts">) => void;
}) {
  const [starting, setStarting] = useState(false);
  const running = draft?.status === "drafting" || draft?.status === "verifying";
  const latest = events.at(-1);

  async function start() {
    setStarting(true);
    const response = await fetch("/api/pipeline", { method: "POST" });
    setStarting(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "The draft did not start.");
      return;
    }
    onStarted(body.draftId);
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {running && latest && (
        <p className="hidden truncate text-sm text-muted-foreground sm:block" aria-live="polite">
          {latest.label}
        </p>
      )}
      <Button size="sm" onClick={start} disabled={starting || running}>
        <Play aria-hidden /> {running ? "Drafting" : "Draft the motion"}
      </Button>
    </div>
  );
}
