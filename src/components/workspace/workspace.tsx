"use client";

import { useQuery } from "convex/react";
import { Compass } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readOwnCases, writeOwnCases } from "@/lib/own-cases";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CasesPanel } from "./cases-panel";
import { DraftPaper, isEmpty } from "./draft-paper";
import { EvidencePanel } from "./evidence-panel";
import { GateBar } from "./gate-bar";
import { isRunning, RunControl, RunProgress } from "./run-control";
import { standingOf } from "./status";
import { Tour, type TourState, tourDone } from "./tour";

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

type Pane = "draft" | "evidence" | "cases";

export function Workspace() {
  const [matterId, setMatterId] = useState<string | null>(null);
  const [ownCases, setOwnCases] = useState<string[]>([]);
  // Blank until the person asks for a draft. Choosing another case blanks it again.
  const [draftId, setDraftId] = useState<Id<"drafts"> | null>(null);
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("draft");
  const isDesktop = useIsDesktop();
  const [tour, setTour] = useState(false);
  // Attaching a case waits until the tour has been walked once: that is where the flow is learned.
  const [tourFinished, setTourFinished] = useState(true);
  // The tour opens by itself until it has been finished, on a screen wide enough to show what it
  // points at.
  const router = useRouter();
  // A link from Signed drafts names a draft to open as signed. Read once on arrival, from the URL
  // itself: useSearchParams would put a Suspense boundary around the whole workspace.
  const [draftParam, setDraftParam] = useState<Id<"drafts"> | null>(null);
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("draft") as Id<"drafts"> | null;
    setDraftParam(param);
    const done = tourDone();
    setTourFinished(done);
    // Not over a signed draft someone came to read.
    if (window.matchMedia(DESKTOP).matches && !done && !param) setTour(true);
  }, []);
  const [source, setSource] = useState<{ id: string | null; quotes: string[] }>({
    id: null,
    quotes: [],
  });
  useEffect(() => setOwnCases(readOwnCases()), []);

  const listed = useQuery(api.matters.list, { ids: ownCases });
  // A signed draft can name a case this browser does not list (attached elsewhere); fetch it alone.
  const known = listed?.some((m) => m.matterId === matterId) ?? false;
  const fetchedMatter = useQuery(
    api.matters.get,
    matterId && listed && !known ? { matterId } : "skip",
  );
  const matters = listed && fetchedMatter ? [...listed, fetchedMatter] : listed;
  const matter = matters?.find((m) => m.matterId === matterId) ?? null;
  const lastDraft = useQuery(api.drafts.latest, matterId ? { matterId, lane: "pipeline" } : "skip");
  const state = useQuery(api.drafts.get, draftId ? { draftId } : "skip");
  const loading = draftId !== null && state === undefined;

  useEffect(() => {
    if (!draftParam) return;
    setDraftId(draftParam);
    setLive(false);
    setSelectedId(null);
    setPane("draft");
  }, [draftParam]);
  // Its case becomes the chosen one once the draft is known.
  const loadedMatterId = state?.draft._id === draftParam ? state.draft.matterId : null;
  useEffect(() => {
    if (loadedMatterId) setMatterId(loadedMatterId);
  }, [loadedMatterId]);

  const sentences = state?.sentences ?? [];
  const signedAt = state?.draft.status === "signed" ? (state.draft.signedAt ?? null) : null;
  const adjudications = state?.adjudications ?? [];
  const selected = sentences.find((s) => s.sentenceId === selectedId) ?? null;

  function chooseMatter(id: string | null) {
    // The URL stops naming a draft that is no longer shown.
    if (draftParam) {
      router.replace("/");
      setDraftParam(null);
    }
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
        writeOwnCases(next);
        chooseMatter(id);
      }}
      attachLocked={isDesktop && !tourFinished}
      sourceId={source.id}
      quotes={source.quotes}
      onSelect={(id) => setSource({ id, quotes: [] })}
    />
  );
  const drafting = isRunning(state?.draft ?? null);
  const paper = (
    <DraftPaper
      loading={loading}
      drafting={drafting}
      sentences={sentences}
      adjudications={adjudications}
      selectedId={selectedId}
      onSelect={select}
      matter={matter}
      signedAt={signedAt}
    />
  );
  // The empty line sits outside the scroll area, which does not give its content a height to
  // centre in.
  const draft = isEmpty({ sentences, drafting, loading }) ? (
    paper
  ) : (
    <ScrollArea className="h-full">
      {sentences.length > 0 && (
        <p className="mx-auto max-w-[46rem] px-4 pt-4 text-center text-xs text-muted-foreground">
          Click a sentence to see its source. <span className="text-verified">Green</span> passed,{" "}
          <span className="text-review">amber</span> is your call,{" "}
          <span className="text-blocked">red</span> failed.
          {!live && " An earlier draft of this case."}
        </p>
      )}
      {paper}
    </ScrollArea>
  );
  const openCount = sentences.filter((s) => {
    const standing = standingOf(
      s,
      adjudications.find((a) => a.sentenceId === s.sentenceId),
    );
    return standing === "review" || standing === "blocked" || standing === "unverified";
  }).length;
  const tourState: TourState = {
    preparedId: matters?.find((m) => m.prepared)?.matterId ?? null,
    matterId,
    drafting,
    finished: Boolean(finished),
    live,
    sentences: sentences.length,
    selected: selectedId !== null,
    decided: adjudications.length,
    gateOpen: sentences.length > 0 && openCount === 0,
    signed: state?.draft.status === "signed",
  };
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
    <>
      <div className="flex h-full min-h-0 flex-col print:hidden">
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
            {isDesktop && !tour && (
              <Button variant="ghost" size="sm" onClick={() => setTour(true)}>
                <Compass aria-hidden /> Take the tour
              </Button>
            )}
            {matterId && !draftId && lastDraft && (
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
        {isDesktop && (
          <Tour
            state={tourState}
            open={tour}
            onClose={(done) => {
              setTour(false);
              if (done) setTourFinished(true);
            }}
          />
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
      {/* The paper alone is printed: the panes clip it, so a signed draft is rendered once more,
          after the workspace so the tour finds the visible paper first. */}
      {signedAt !== null && (
        <div className="hidden print:block">
          <DraftPaper
            sentences={sentences}
            adjudications={adjudications}
            selectedId={null}
            onSelect={() => {}}
            matter={matter}
            signedAt={signedAt}
          />
        </div>
      )}
    </>
  );
}
