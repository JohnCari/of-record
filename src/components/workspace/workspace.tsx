"use client";

import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MATTER_CAPTION, MATTER_DOCKET, MATTER_ID } from "@/lib/drafting/sections";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DraftPaper } from "./draft-paper";
import { EvidencePanel } from "./evidence-panel";
import { GateBar } from "./gate-bar";
import { RecordPanel } from "./record-panel";
import { RunControl } from "./run-control";
import { standingOf } from "./status";

const DESKTOP = "(min-width: 1024px)";

/** Three panes side by side need room. Below this width the same panes become tabs. */
function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

type Pane = "draft" | "evidence" | "record";

export function Workspace() {
  const [liveId, setLiveId] = useState<Id<"drafts"> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("draft");
  const isDesktop = useIsDesktop();
  const [source, setSource] = useState<{ id: string; quotes: string[] }>({
    id: "doc-78-1",
    quotes: [],
  });

  const recorded = useQuery(api.drafts.featured, { matterId: MATTER_ID, lane: "pipeline" });
  const draftId = liveId ?? recorded ?? null;
  const showingRecorded = !liveId && Boolean(recorded);
  const state = useQuery(api.drafts.get, draftId ? { draftId } : "skip");

  const sentences = state?.sentences ?? [];
  const adjudications = state?.adjudications ?? [];
  const selected = sentences.find((s) => s.sentenceId === selectedId) ?? null;

  function show(sentenceId: string) {
    setSelectedId(sentenceId);
    const sentence = sentences.find((s) => s.sentenceId === sentenceId);
    const cite = sentence?.recordCites[0];
    if (sentence && cite) {
      setSource({ id: cite.docId, quotes: sentence.recordCites.map((c) => c.quote) });
    }
  }
  function select(sentenceId: string) {
    show(sentenceId);
    setPane("evidence");
  }

  // The first thing on screen is an example, not an empty pane: a sentence that is the reader's
  // call, with the filing open at its quote.
  const finished = state?.draft.status === "gated" || state?.draft.status === "signed";
  useEffect(() => {
    if (!finished || selectedId !== null) return;
    const first =
      sentences.find((s) => standingOf(s) === "review") ??
      sentences.find((s) => s.recordCites.length > 0);
    if (first) show(first.sentenceId);
    // show() reads sentences from this render; nothing else should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, draftId]);

  const record = (
    <RecordPanel
      sourceId={source.id}
      quotes={source.quotes}
      onSelect={(id) => setSource({ id, quotes: [] })}
    />
  );
  const draft = (
    <ScrollArea className="h-full">
      {sentences.length > 0 && (
        <p className="mx-auto max-w-[46rem] px-4 pt-4 text-center text-xs text-muted-foreground">
          Click any sentence to see the filing it rests on.{" "}
          <span className="text-verified">Green</span> passed every check,{" "}
          <span className="text-review">amber</span> is your call,{" "}
          <span className="text-blocked">red</span> failed.
          {showingRecorded && " This is a recorded run."}
        </p>
      )}
      <DraftPaper
        sentences={sentences}
        adjudications={adjudications}
        selectedId={selectedId}
        onSelect={select}
        caption={MATTER_CAPTION}
      />
    </ScrollArea>
  );
  const evidence = (
    <EvidencePanel
      draftId={draftId ?? ""}
      sentence={selected}
      adjudication={adjudications.find((a) => a.sentenceId === selectedId)}
      readOnly={showingRecorded}
      onOpenSource={(id, quotes) => {
        setSource({ id, quotes });
        setPane("record");
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base leading-tight">{MATTER_CAPTION}</h1>
          <p className="text-xs text-muted-foreground">
            {MATTER_DOCKET}, D. Colo. A real case, from public filings on CourtListener.
          </p>
        </div>
        <div className="ml-auto">
          <RunControl
            draft={state?.draft ?? null}
            events={state?.events ?? []}
            onStarted={(id) => {
              setLiveId(id);
              setSelectedId(null);
              setPane("draft");
            }}
          />
        </div>
      </header>

      {state && (
        <GateBar
          draft={state.draft}
          sentences={sentences}
          adjudications={adjudications}
          readOnly={showingRecorded}
          onJumpToOpen={select}
        />
      )}

      {isDesktop ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="27%" minSize="18%" className="bg-card">
            {record}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="45%" minSize="30%">
            {draft}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="28%" minSize="20%" className="bg-card">
            {evidence}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          <Tabs value={pane} onValueChange={(value) => setPane(value as Pane)}>
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="record">Record</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Every pane stays mounted, so the scroll position survives a switch. */}
          {(
            [
              ["draft", draft, ""],
              ["evidence", evidence, "bg-card"],
              ["record", record, "bg-card"],
            ] as [Pane, ReactNode, string][]
          ).map(([id, content, tone]) => (
            <div key={id} className={cn("min-h-0 flex-1", tone, pane !== id && "hidden")}>
              {content}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
