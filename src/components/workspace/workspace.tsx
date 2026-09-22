"use client";

import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MATTER_CAPTION, MATTER_DOCKET, MATTER_ID } from "@/lib/drafting/sections";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AssociateConsole } from "./associate-console";
import { DraftPaper } from "./draft-paper";
import { EvidencePanel } from "./evidence-panel";
import { GateBar } from "./gate-bar";
import { PipelineConsole } from "./pipeline-console";
import { RecordPanel } from "./record-panel";

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

type Lane = "agentic" | "pipeline";
type Pane = "draft" | "evidence" | "record" | "run";

export function Workspace() {
  const [lane, setLane] = useState<Lane>("pipeline");
  const [live, setLive] = useState<Partial<Record<Lane, Id<"drafts">>>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("draft");
  const isDesktop = useIsDesktop();
  const [source, setSource] = useState<{ id: string; quotes: string[] }>({
    id: "doc-78-1",
    quotes: [],
  });

  // The agent creates its draft on its first write; the browser finds it by session.
  const sessionDraft = useQuery(api.drafts.bySession, sessionId ? { sessionId } : "skip");
  const recorded = useQuery(api.drafts.featured, { matterId: MATTER_ID, lane });

  const liveId = lane === "agentic" ? (sessionDraft ?? live.agentic) : live.pipeline;
  const draftId = liveId ?? recorded ?? null;
  const showingRecorded = !liveId && Boolean(recorded);
  const state = useQuery(api.drafts.get, draftId ? { draftId } : "skip");

  const sentences = state?.sentences ?? [];
  const adjudications = state?.adjudications ?? [];
  const selected = sentences.find((s) => s.sentenceId === selectedId) ?? null;

  function select(sentenceId: string) {
    setSelectedId(sentenceId);
    setPane("evidence");
    const sentence = sentences.find((s) => s.sentenceId === sentenceId);
    const cite = sentence?.recordCites[0];
    if (sentence && cite) {
      setSource({ id: cite.docId, quotes: sentence.recordCites.map((c) => c.quote) });
    }
  }

  const record = (
    <RecordPanel
      sourceId={source.id}
      quotes={source.quotes}
      onSelect={(id) => setSource({ id, quotes: [] })}
    />
  );
  const draft = (
    <ScrollArea className="h-full">
      {showingRecorded && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Badge variant="secondary" className="gap-1.5">
            <History className="size-3" aria-hidden /> Recorded run, no model is being called
          </Badge>
        </div>
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
  // Both consoles stay mounted so switching lanes never drops a live agent session.
  const consoles = (
    <>
      <div className={lane === "agentic" ? "h-full" : "hidden"}>
        <AssociateConsole onSession={setSessionId} />
      </div>
      <div className={lane === "pipeline" ? "h-full" : "hidden"}>
        <PipelineConsole
          draft={lane === "pipeline" ? (state?.draft ?? null) : null}
          events={lane === "pipeline" ? (state?.events ?? []) : []}
          onStarted={(id) => {
            setLive((current) => ({ ...current, pipeline: id }));
            setPane("draft");
          }}
        />
      </div>
    </>
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
        <Tabs
          value={lane}
          onValueChange={(value) => {
            setLane(value as Lane);
            setSelectedId(null);
          }}
          className="ml-auto"
        >
          <TabsList>
            <TabsTrigger value="pipeline">Jev-first pipeline</TabsTrigger>
            <TabsTrigger value="agentic">Agent</TabsTrigger>
          </TabsList>
        </Tabs>
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
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="74%" minSize="35%">
            <ResizablePanelGroup orientation="horizontal">
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
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="26%" minSize="12%" className="bg-card">
            {consoles}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          <Tabs value={pane} onValueChange={(value) => setPane(value as Pane)}>
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="record">Record</TabsTrigger>
              <TabsTrigger value="run">{lane === "agentic" ? "Agent" : "Run"}</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Every pane stays mounted, so a live session and the scroll position survive a switch. */}
          {(
            [
              ["draft", draft, ""],
              ["evidence", evidence, "bg-card"],
              ["record", record, "bg-card"],
              ["run", consoles, "bg-card"],
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
