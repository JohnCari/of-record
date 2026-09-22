import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholders shaped like the content they stand in for, so a loading pane looks like a pane
 * about to fill rather than a grey block. Widths taper the way lines of prose do.
 */
export function TextLines({ lines = 6, heading = false }: { lines?: number; heading?: boolean }) {
  const widths = [92, 100, 84, 96, 70, 88, 94, 60];
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {heading && <Skeleton className="mb-1 h-5 w-2/3" />}
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <Skeleton key={i} className="h-3.5" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  );
}

/** Stands in for a list of search results: a title line and a shorter detail line, per row. */
export function ResultRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={i} className="flex flex-col gap-2 rounded-md border px-3 py-2.5">
          <Skeleton className="h-4" style={{ width: `${70 - (i % 3) * 12}%` }} />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
