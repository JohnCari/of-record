import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { AttachCaseDialog } from "./attach-case-dialog";
import { CaseSearch } from "./case-search";
import { TextLines } from "./placeholders";
import { Quoted } from "./quoted";

export function CasesPanel({
  matters,
  matterId,
  onChooseMatter,
  onAttached,
  sourceId,
  quotes,
  onSelect,
}: {
  matters: Doc<"matters">[];
  matterId: string;
  onChooseMatter: (matterId: string) => void;
  onAttached: (matterId: string) => void;
  sourceId: string | null;
  quotes: string[];
  onSelect: (sourceId: string) => void;
}) {
  const sources = useQuery(api.knowledge.listSources, { matterId, kind: "record" });
  const source = useQuery(api.knowledge.getSource, sourceId ? { matterId, sourceId } : "skip");
  const body = useRef<HTMLDivElement>(null);

  // Bring the highlighted words into view when a sentence sends the reader here. The rendered
  // marks depend on both the document and the quotes, so both are dependencies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the document or quotes change
  useEffect(() => {
    body.current?.querySelector("mark.quoted")?.scrollIntoView({ block: "center" });
  }, [source?._id, quotes.join("|")]);

  return (
    <Tabs defaultValue="file" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList className="w-full rounded-none border-b">
        <TabsTrigger value="file">Cases</TabsTrigger>
        <TabsTrigger value="search">Find a case</TabsTrigger>
      </TabsList>
      <TabsContent value="file" className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-col gap-2 border-b p-2">
            <div className="flex gap-2">
              <Select value={matterId} onValueChange={onChooseMatter}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Case">
                  <SelectValue placeholder="Choose a case" />
                </SelectTrigger>
                <SelectContent>
                  {matters.map((m) => (
                    <SelectItem key={m.matterId} value={m.matterId}>
                      {m.caption}
                      {m.prepared ? " (prepared)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AttachCaseDialog onAttached={onAttached} />
            </div>
            <Select value={sourceId ?? ""} onValueChange={onSelect}>
              <SelectTrigger className="w-full" aria-label="Filing">
                <SelectValue placeholder="Choose a filing to read" />
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
              {sourceId && source === undefined && <TextLines lines={10} heading />}
              {!sourceId && (
                <p className="text-sm text-muted-foreground">
                  {sources?.length ?? 0} filings. Choose one to read, or click a sentence in the
                  draft.
                </p>
              )}
              {source && (
                <>
                  <h2 className="font-serif text-lg leading-snug">{source.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    As filed.
                    {/scan/i.test(source.notice ?? "") && " Scanned, so some words are misread."}{" "}
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline underline-offset-4"
                      >
                        Original on CourtListener <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>
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
      </TabsContent>
      <TabsContent value="search" className="min-h-0 flex-1">
        <CaseSearch />
      </TabsContent>
    </Tabs>
  );
}
