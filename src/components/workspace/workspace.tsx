"use client";

import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MATTER_ID } from "@/lib/drafting/sections";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CasesPanel } from "./cases-panel";
import { DraftPaper } from "./draft-paper";
import { EvidencePanel } from "./evidence-panel";
import { GateBar } from "./gate-bar";
import { isRunning, RunControl, RunProgress } from "./run-control";
import { standingOf } from "./status";

const DESKTOP = "(min-width: 1024px)";
const OWN_CASES = "rossrecall.cases";

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

/** The cases this browser attached. Kept here so an attached case is not listed to everyone. */
function readOwnCases(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OWN_CASES) ?? "[]");
  } catch {
    return [];
  }
}

type Pane = "draft" | "evidence" | "cases";

export function Workspace() {
  const [matterId, setMatterId] = useState(MATTER_ID);
  const [ownCases, setOwnCases] = useState<string[]>([]);
  // Blank until the person asks for a draft. Choosing another case blanks it again.
  const [draftId, setDraftId] = useState<Id<"drafts"> | null>(null);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("draft");
  const isDesktop = useIsDesktop();
  const [source, setSource] = useState<{ id: string | null; quotes: string[] }>({
    id: null,
    quotes: [],
  });
  useEffect(() => setOwnCases(readOwnCases()), []);

  const matters = useQuery(api.matters.list, { ids: ownCases });
  const matter = matters?.find((m) => m.matterId === matterId) ?? null;
  const lastDraft = useQuery(api.drafts.latest, { matterId, lane: "pipeline" });
  const state = useQuery(api.drafts.get, draftId ? { draftId } : "skip");
  const loading = draftId !== null && state === undefined;

  const sentences = state?.sentences ?? [];
  const adjudications = state?.adjudications ?? [];
  const selected = sentences.find((s) => s.sentenceId === selectedId) ?? null;

  function chooseMatter(id: string) {
    setMatterId(id);
    setDraftId(null);
    setLive(false);
    setSelectedId(null);
    setSource({ id: null, quotes: [] });
  }

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

  // When a draft finishes, open on a sentence that is the reader's call, with the filing at its
  // quote. Once per draft, and never over a choice already made.
  const finished = state?.draft.status === "gated" || state?.draft.status === "signed";
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || !draftId || opened.current === draftId) return;
    opened.current = draftId;
    const first =
      sentences.find((s) => standingOf(s) === "review") ??
      sentences.find((s) => s.recordCites.length > 0);
    if (!first) return;
    setSelectedId(first.sentenceId);
    setSource({ id: first.recordCites[0].docId, quotes: first.recordCites.map((c) => c.quote) });
  }, [finished, draftId, sentences]);

  const wasRunning = useRef(false);
  useEffect(() => {
    const running = isRunning(state?.draft ?? null);
    if (wasRunning.current && !running && live && state) {
      const review = sentences.filter((s) => standingOf(s) === "review").length;
      toast.success(`Draft ready: ${sentences.length} sentences, ${review} for your review.`);
    }
    wasRunning.current = running;
  }, [state, live, sentences]);

  const cases = (
    <CasesPanel
      matters={matters ?? []}
      matterId={matterId}
      onChooseMatter={chooseMatter}
      onAttached={(id) => {
        const next = [...ownCases, id];
        setOwnCases(next);
        try {
          localStorage.setItem(OWN_CASES, JSON.stringify(next));
        } catch {}
        chooseMatter(id);
      }}
      sourceId={source.id}
      quotes={source.quotes}
      onSelect={(id) => setSource({ id, quotes: [] })}
    />
  );
  const draft = (
    <ScrollArea className="h-full">
      {sentences.length > 0 && (
        <p className="mx-auto max-w-[46rem] px-4 pt-4 text-center text-xs text-muted-foreground">
          Click a sentence to see its source. <span className="text-verified">Green</span> passed,{" "}
          <span className="text-review">amber</span> is your call,{" "}
          <span className="text-blocked">red</span> failed.
          {!live && " An earlier draft of this case."}
        </p>
      )}
      <DraftPaper
        loading={loading}
        drafting={isRunning(state?.draft ?? null)}
        sentences={sentences}
        adjudications={adjudications}
        selectedId={selectedId}
        onSelect={select}
        matter={matter}
      />
    </ScrollArea>
  );
  const evidence = (
    <EvidencePanel
      draftId={draftId ?? ""}
      sentence={selected}
      adjudication={adjudications.find((a) => a.sentenceId === selectedId)}
      readOnly={!live}
      onOpenSource={(id, quotes) => {
        setSource({ id, quotes });
        setPane("cases");
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base leading-tight">
            {matter?.caption ?? "Choose a case"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {matter?.docketNumber ? `${matter.docketNumber}, ` : ""}
            {matter?.court}
            {matter?.prepared && ". Prepared in advance from public filings."}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!draftId && lastDraft && (
            <Button variant="ghost" size="sm" onClick={() => setDraftId(lastDraft)}>
              Show the last draft
            </Button>
          )}
          <RunControl
            draft={state?.draft ?? null}
            matterId={matterId}
            onStarted={(id) => {
              setDraftId(id);
              setLive(true);
              setSelectedId(null);
              setPane("draft");
            }}
          />
        </div>
      </header>

      {state && <RunProgress draft={state.draft} events={state.events} />}
      {loading && (
        <div className="flex items-center gap-4 border-b bg-card px-4 py-2.5" aria-hidden>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-5 w-40" />
        </div>
      )}
      {state && (
        <GateBar
          draft={state.draft}
          sentences={sentences}
          adjudications={adjudications}
          readOnly={!live}
          onJumpToOpen={select}
        />
      )}

      {isDesktop ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="27%" minSize="18%" className="bg-card">
            {cases}
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
              <TabsTrigger value="cases">Cases</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Every pane stays mounted, so the scroll position survives a switch. */}
          {(
            [
              ["cases", cases, "bg-card"],
              ["draft", draft, ""],
              ["evidence", evidence, "bg-card"],
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
