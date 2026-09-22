import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SECTIONS } from "@/lib/drafting/sections";
import { cn } from "@/lib/utils";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Empty } from "./placeholders";
import { type Adjudication, type Sentence, STANDING, shortCite, standingOf } from "./status";

/** True when there is no paper to show: the pane holds a single centred line instead. */
export const isEmpty = ({
  sentences,
  drafting = false,
  loading = false,
}: {
  sentences: Sentence[];
  drafting?: boolean;
  loading?: boolean;
}) => sentences.length === 0 && !drafting && !loading;

export function DraftPaper({
  drafting = false,
  loading = false,
  sentences,
  adjudications,
  selectedId,
  onSelect,
  matter,
  signedAt = null,
}: {
  /** True while a live run is writing: empty sections are shown as placeholder lines. */
  drafting?: boolean;
  /** True until the draft to show is known. */
  loading?: boolean;
  sentences: Sentence[];
  adjudications: Adjudication[];
  selectedId: string | null;
  onSelect: (sentenceId: string) => void;
  matter: Doc<"matters"> | null;
  /** When the draft is signed: the signature line closes the paper. */
  signedAt?: number | null;
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

  // Before anything is known, show the paper with placeholder lines rather than an empty message
  // that would flash and then be wrong.
  if (isEmpty({ sentences, drafting, loading })) {
    return <Empty icon={FileText}>{matter ? "Draft the motion." : "Then draft the motion."}</Empty>;
  }

  return (
    <article
      ref={paper}
      data-tour="paper"
      className="pleading mx-auto my-3 max-w-[46rem] rounded-sm py-6 pr-4 shadow-sm ring-1 ring-black/5 sm:my-6 sm:py-10 sm:pr-10"
    >
      <header className="pleading-line mb-6">
        <div>
          <p className="text-sm">{matter?.court}</p>
          <p className="font-semibold">{matter?.caption}</p>
          {matter?.docketNumber && <p className="text-sm">{matter.docketNumber}</p>}
          <p className="mt-3 text-center font-semibold">{matter?.motionTitle}</p>
        </div>
      </header>

      {SECTIONS.map((section) => {
        const rows = sentences.filter((s) => s.sectionId === section.id);
        if (rows.length === 0 && !drafting && !loading) return null;
        return (
          <section key={section.id} className="mb-6">
            <div className="pleading-line">
              <h2 className="font-semibold">{section.title}</h2>
            </div>
            {rows.length === 0 &&
              [96, 100, 88, 58].map((width, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
                <div key={i} className="pleading-line">
                  <Skeleton className="my-2 h-4" style={{ width: `${width}%` }} />
                </div>
              ))}
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
                            "absolute top-1.5 bottom-1.5 left-1 w-1 rounded-full print:hidden",
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
      {signedAt !== null && (
        <footer className="pleading-line mt-8 text-sm">
          <p>
            Signed{" "}
            {new Date(signedAt).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
            . Every sentence checked against its source.
          </p>
        </footer>
      )}
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
