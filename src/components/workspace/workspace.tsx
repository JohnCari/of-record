"use client";

import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MATTER_CAPTION } from "@/lib/drafting/sections";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AssociateConsole } from "./associate-console";
import { DraftPaper } from "./draft-paper";
import { EvidencePanel } from "./evidence-panel";
import { GateBar } from "./gate-bar";
import { PipelineConsole } from "./pipeline-console";
import { RecordPanel } from "./record-panel";

type Lane = "agentic" | "pipeline";

export function Workspace() {
  const [lane, setLane] = useState<Lane>("agentic");
  const [live, setLive] = useState<Partial<Record<Lane, Id<"drafts">>>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [source, setSource] = useState<{ id: string; quotes: string[] }>({
    id: "ex-a",
    quotes: [],
  });

  // The agent creates its draft on its first write; the browser finds it by session.
  const sessionDraft = useQuery(api.drafts.bySession, sessionId ? { sessionId } : "skip");
  const recorded = useQuery(api.drafts.featured, { lane });

  const liveId = lane === "agentic" ? (sessionDraft ?? live.agentic) : live.pipeline;
  const draftId = liveId ?? recorded ?? null;
  const showingRecorded = !liveId && Boolean(recorded);
  const state = useQuery(api.drafts.get, draftId ? { draftId } : "skip");

  const sentences = state?.sentences ?? [];
  const adjudications = state?.adjudications ?? [];
  const selected = sentences.find((s) => s.sentenceId === selectedId) ?? null;

  function select(sentenceId: string) {
    setSelectedId(sentenceId);
    const sentence = sentences.find((s) => s.sentenceId === sentenceId);
    const cite = sentence?.recordCites[0];
    if (sentence && cite) {
      setSource({ id: cite.docId, quotes: sentence.recordCites.map((c) => c.quote) });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2">
        <SidebarTrigger />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base leading-tight">{MATTER_CAPTION}</h1>
          <p className="text-xs text-muted-foreground">
            A synthetic matter. Every party, date and amount is fictional.
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
            <TabsTrigger value="agentic">Agentic lane</TabsTrigger>
            <TabsTrigger value="pipeline">Deterministic lane</TabsTrigger>
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

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="68%" minSize="35%">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="27%" minSize="18%" className="hidden bg-card md:block">
              <RecordPanel
                sourceId={source.id}
                quotes={source.quotes}
                onSelect={(id) => setSource({ id, quotes: [] })}
              />
            </ResizablePanel>
            <ResizableHandle withHandle className="hidden md:flex" />
            <ResizablePanel defaultSize="45%" minSize="30%">
              <ScrollArea className="h-full">
                {showingRecorded && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Badge variant="secondary" className="gap-1.5">
                      <History className="size-3" aria-hidden /> Recorded run, no model is being
                      called
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
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="28%" minSize="20%" className="bg-card">
              <EvidencePanel
                draftId={draftId ?? ""}
                sentence={selected}
                adjudication={adjudications.find((a) => a.sentenceId === selectedId)}
                readOnly={showingRecorded}
                onOpenSource={(id, quotes) => setSource({ id, quotes })}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="32%" minSize="15%" className="bg-card">
          {/* Both consoles stay mounted so switching lanes never drops a live agent session. */}
          <div className={lane === "agentic" ? "h-full" : "hidden"}>
            <AssociateConsole onSession={setSessionId} />
          </div>
          <div className={lane === "pipeline" ? "h-full" : "hidden"}>
            <PipelineConsole
              draft={lane === "pipeline" ? (state?.draft ?? null) : null}
              events={lane === "pipeline" ? (state?.events ?? []) : []}
              onStarted={(id) => setLive((current) => ({ ...current, pipeline: id }))}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
