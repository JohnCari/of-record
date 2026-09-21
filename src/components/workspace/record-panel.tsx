import { useQuery } from "convex/react";
import { ExternalLink, Landmark } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MATTER_ID } from "@/lib/drafting/sections";
import { api } from "../../../convex/_generated/api";
import { Quoted } from "./quoted";

export function RecordPanel({
  sourceId,
  quotes,
  onSelect,
}: {
  sourceId: string;
  quotes: string[];
  onSelect: (sourceId: string) => void;
}) {
  const sources = useQuery(api.knowledge.listSources, { matterId: MATTER_ID, kind: "record" });
  const source = useQuery(api.knowledge.getSource, { matterId: MATTER_ID, sourceId });
  const body = useRef<HTMLDivElement>(null);

  // Bring the highlighted words into view when a sentence sends the reader here. The rendered
  // marks depend on both the document and the quotes, so both are dependencies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the document or quotes change
  useEffect(() => {
    body.current?.querySelector("mark.quoted")?.scrollIntoView({ block: "center" });
  }, [source?._id, quotes.join("|")]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <Select value={sourceId} onValueChange={onSelect}>
          <SelectTrigger className="w-full" aria-label="Record document">
            <SelectValue placeholder="Choose a filing" />
          </SelectTrigger>
          <SelectContent>
            {(sources ?? []).map((s) => (
              <SelectItem key={s.sourceId} value={s.sourceId}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div ref={body} className="flex flex-col gap-3 p-5">
          {source === undefined && <Skeleton className="h-40 w-full" />}
          {source && (
            <>
              <h2 className="font-serif text-lg leading-snug">{source.title}</h2>
              {source.notice && (
                <Alert>
                  <Landmark aria-hidden />
                  <AlertTitle>About this filing</AlertTitle>
                  <AlertDescription>
                    {source.notice}
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 underline underline-offset-4"
                      >
                        Open the original on CourtListener{" "}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {source.passages.map((passage, i) => {
                const heading = passage.section !== source.passages[i - 1]?.section;
                return (
                  <div key={passage._id}>
                    {heading && passage.section && (
                      <h3 className="mt-3 mb-1 text-sm font-medium text-muted-foreground">
                        {passage.section}
                      </h3>
                    )}
                    <p className="font-serif text-[0.95rem] leading-relaxed">
                      <Quoted text={passage.text} quotes={quotes} />
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
