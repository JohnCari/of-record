import { Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export function PipelineConsole({
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

  async function start() {
    setStarting(true);
    const response = await fetch("/api/pipeline", { method: "POST" });
    setStarting(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(body.error ?? "The run did not start.");
      return;
    }
    onStarted(body.draftId);
  }

  const t0 = events[0]?._creationTime ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Button size="sm" onClick={start} disabled={starting || running}>
          <Play aria-hidden /> {running ? "Running" : "Run the pipeline"}
        </Button>
        <p className="text-sm text-muted-foreground">
          A fixed sequence in code. The model fills in each stage and never chooses the next one.
          About two minutes.
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-1 p-4 text-sm">
          {events.length === 0 && (
            <li className="text-muted-foreground">
              No run yet. Stages appear here as they happen.
            </li>
          )}
          {events.map((event, i) => (
            <li key={event._id} className="grid grid-cols-[3.5rem_1fr] gap-2">
              <span className="text-right text-muted-foreground tabular-nums">
                {((event._creationTime - t0) / 1000).toFixed(0)}s
              </span>
              <span
                className={cn(
                  event.type === "error" && "text-blocked",
                  running && i === events.length - 1 && "font-medium",
                )}
              >
                {event.label}
                {event.detail && <span className="text-muted-foreground">. {event.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </div>
  );
}
