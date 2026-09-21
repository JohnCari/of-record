import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MATTER_COURT, MATTER_DOCKET, MOTION_TITLE, SECTIONS } from "@/lib/drafting/sections";
import { cn } from "@/lib/utils";
import { type Adjudication, type Sentence, STANDING, shortCite, standingOf } from "./status";

export function DraftPaper({
  sentences,
  adjudications,
  selectedId,
  onSelect,
  caption,
}: {
  sentences: Sentence[];
  adjudications: Adjudication[];
  selectedId: string | null;
  onSelect: (sentenceId: string) => void;
  caption: string;
}) {
  const decided = new Map(adjudications.map((a) => [a.sentenceId, a]));
  const paper = useRef<HTMLElement>(null);

  // Selection can come from outside the draft ("go to the next open sentence"), so the selected
  // sentence is brought into view wherever the selection came from.
  useEffect(() => {
    if (!selectedId) return;
    paper.current
      ?.querySelector(`[data-sentence="${selectedId}"]`)
      // Instant, not smooth: the record pane scrolls to its highlight a moment later, and Chrome
      // lets a second scrollIntoView cancel a smooth scroll that is still under way.
      ?.scrollIntoView({ block: "center" });
  }, [selectedId]);

  if (sentences.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <FileText className="size-8 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">
          Nothing drafted yet. Start a run below.
        </p>
      </div>
    );
  }

  return (
    <article
      ref={paper}
      className="pleading mx-auto my-6 max-w-[46rem] rounded-sm py-10 pr-10 shadow-sm ring-1 ring-black/5"
    >
      <header className="pleading-line mb-6">
        <div>
          <p className="text-sm">{MATTER_COURT}</p>
          <p className="font-semibold">{caption}</p>
          <p className="text-sm">{MATTER_DOCKET}</p>
          <p className="mt-3 text-center font-semibold">{MOTION_TITLE}</p>
        </div>
      </header>

      {SECTIONS.map((section) => {
        const rows = sentences.filter((s) => s.sectionId === section.id);
        if (rows.length === 0) return null;
        return (
          <section key={section.id} className="mb-6">
            <div className="pleading-line">
              <h2 className="font-semibold">{section.title}</h2>
            </div>
            {rows.map((sentence) => {
              const standing = standingOf(sentence, decided.get(sentence.sentenceId));
              const meta = STANDING[standing];
              const selected = selectedId === sentence.sentenceId;
              return (
                <div key={sentence._id} className="pleading-line">
                  <button
                    type="button"
                    data-sentence={sentence.sentenceId}
                    onClick={() => onSelect(sentence.sentenceId)}
                    aria-pressed={selected}
                    className={cn(
                      "group relative block w-full rounded-sm py-0.5 text-left outline-none transition-colors",
                      "hover:bg-[#14213d]/5 focus-visible:ring-2 focus-visible:ring-[#3b5b92]",
                      selected && "bg-[#14213d]/[0.07]",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "absolute top-1.5 bottom-1.5 left-1 w-1 rounded-full",
                            meta.mark,
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="left">{meta.label}</TooltipContent>
                    </Tooltip>
                    <span
                      className={cn("pl-2", standing === "struck" && "line-through opacity-50")}
                    >
                      {sentence.text}
                    </span>
                    <Cites sentence={sentence} />
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
    </article>
  );
}

/** Citations in the form a filing uses, after the sentence they support. */
function Cites({ sentence }: { sentence: Sentence }) {
  const cites = [
    ...sentence.recordCites.map((c, i) =>
      shortCite(
        c.docId,
        // The page comes from where the verifier actually found the quote, not from the drafter.
        sentence.verification?.checks.find((k) => k.target === "record" && k.citeIndex === i)
          ?.evidence?.section,
      ),
    ),
    ...sentence.authorityCites.map((c) => `${c.caseName}, ${c.citation}`),
  ];
  if (cites.length === 0) return null;
  // Two quotes from one page are one cite on the page, as in a brief.
  return (
    <span className="pl-1 text-[0.9em] text-[#55627a]"> ({[...new Set(cites)].join("; ")}.)</span>
  );
}
