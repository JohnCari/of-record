"use client";

import { MousePointerClick, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A guided first run on the prepared case. Each step points at the one control to use next and
 * moves on by itself when the person has used it, so the tour is a hand on the shoulder, not a
 * modal: nothing is covered and every click lands on the real app.
 */

/** What the tour watches. The workspace derives it from its own state. */
export type TourState = {
  preparedId: string | null;
  matterId: string | null;
  drafting: boolean;
  finished: boolean;
  live: boolean;
  sentences: number;
  selected: boolean;
  decided: number;
  gateOpen: boolean;
  signed: boolean;
};

type Step = {
  /** The `data-tour` value of the element to point at. */
  target: string;
  title: string;
  body: string;
  /** True once the person has done this step; the tour moves on without a click. */
  done?: (s: TourState) => boolean;
  /** Skip the step entirely, e.g. a control that is not on the page in this mode. */
  skip?: (s: TourState) => boolean;
};

// Action steps have `done` and are titled as instructions; the rest explain what appeared.
const STEPS: Step[] = [
  {
    target: "case",
    title: "Choose the prepared case",
    body: "Open this list and pick Granite Southlands v. Alberta Town Center. A real case from public filings, with 24 documents in the record.",
    done: (s) => s.matterId !== null && s.matterId === s.preparedId,
  },
  {
    target: "run",
    title: "Draft the motion",
    body: "Jev reads every page of the 24 filings and picks the passages that prove each point. Gemini writes only the few sentences that connect them. About half a minute.",
    done: (s) => s.drafting || s.sentences > 0,
  },
  {
    target: "progress",
    title: "It is working",
    body: "Reading the record, finding the rule in each opinion, writing, then checking every sentence against its source.",
    done: (s) => s.finished || (s.sentences > 0 && !s.drafting),
    skip: (s) => !s.drafting,
  },
  {
    target: "paper",
    title: "Every sentence has a mark",
    body: "Green passed every check. Amber is your call. Red failed. The first amber sentence is already selected; click any other to see its source.",
  },
  {
    target: "evidence",
    title: "Its source and its checks",
    body: "The quote it rests on, the opinion it cites, and what the judge found. Nothing here was written by the writing model.",
  },
  {
    target: "filing",
    title: "The filing, open at the words",
    body: "The record opens at the quoted passage, highlighted. Read around it. That is what a check means here.",
  },
  {
    target: "decide",
    title: "Decide this sentence",
    body: "Accept or strike, with a reason. Your decision and your reason stay with the sentence.",
    done: (s) => s.decided > 0,
    skip: (s) => !s.live,
  },
  {
    target: "gate",
    title: "Decide the rest",
    body: "“Next open sentence” takes you to each one. The count here falls as you go.",
    done: (s) => s.gateOpen || s.signed,
    skip: (s) => !s.live,
  },
  {
    target: "sign",
    title: "Sign the draft",
    body: "Unlocked only now that nothing is open. Every sentence is checked once more as you sign.",
    done: (s) => s.signed,
    skip: (s) => !s.live,
  },
  {
    target: "case",
    title: "That is the whole app",
    body: "Your signed draft is under Signed drafts, ready to print. Attaching your own filings is now unlocked, with the button beside this list.",
  },
];

const DONE = "rossrecall.tour";
const CARD_W = 320;
const GAP = 12;
const ARROW = 8;

/** True once the tour has been walked to its end in this browser. */
export function tourDone(): boolean {
  try {
    return localStorage.getItem(DONE) === "done";
  } catch {
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE, "done");
  } catch {}
}

type Side = "below" | "above" | "right" | "left" | "inside";

/**
 * Where the card goes: below the target if there is room, else above, else beside it. A target
 * taller than half the screen (a pane, the paper) gets the card floating inside its lower part.
 * The side is returned so the card can point its arrow at the target.
 */
function place(rect: DOMRect, height: number): { top: number; left: number; side: Side } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = GAP + ARROW;
  let top: number;
  let side: Side;
  let left = rect.left + rect.width / 2 - CARD_W / 2;
  if (rect.height > vh / 2 && rect.width >= CARD_W + 2 * GAP) {
    top = Math.min(rect.bottom, vh) - height - 2 * GAP;
    side = "inside";
  } else if (rect.bottom + gap + height <= vh) {
    top = rect.bottom + gap;
    side = "below";
  } else if (rect.top - gap - height >= 0) {
    top = rect.top - gap - height;
    side = "above";
  } else {
    top = Math.max(GAP, Math.min(vh - height - GAP, rect.top));
    if (rect.right + gap + CARD_W <= vw) {
      left = rect.right + gap;
      side = "right";
    } else {
      left = rect.left - gap - CARD_W;
      side = "left";
    }
  }
  left = Math.max(GAP, Math.min(vw - CARD_W - GAP, left));
  return { top, left, side };
}

export function Tour({
  state,
  open,
  onClose,
}: {
  state: TourState;
  open: boolean;
  /** `done` is true only from the last step's button; closing early leaves the tour unfinished. */
  onClose: (done: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(160);

  const step = STEPS[index];

  // Start over each time the tour opens.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Move past steps the person has done, or that do not apply.
  useEffect(() => {
    if (!open) return;
    let i = index;
    while (i < STEPS.length - 1 && (STEPS[i].skip?.(state) || STEPS[i].done?.(state))) i += 1;
    if (i !== index) setIndex(i);
  }, [open, index, state]);

  // Follow the target: it can move as panes fill, resize, or scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const find = () => document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    // A small control is brought to the middle of its pane; a pane or the paper is left where it is.
    const el = find();
    el?.scrollIntoView({
      block: el.getBoundingClientRect().height < window.innerHeight / 2 ? "center" : "nearest",
    });
    const measure = () => setRect(find()?.getBoundingClientRect() ?? null);
    measure();
    const timer = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step.target]);

  if (!open) return null;

  const last = index === STEPS.length - 1;
  const action = Boolean(step.done) && !last;
  const pos = rect
    ? place(rect, cardHeight)
    : {
        top: window.innerHeight / 2 - cardHeight / 2,
        left: window.innerWidth / 2 - CARD_W / 2,
        side: "inside" as Side,
      };
  // The arrow sits on the card edge that faces the target, centred on the target where it can be.
  const arrow =
    rect && pos.side !== "inside"
      ? pos.side === "below" || pos.side === "above"
        ? {
            left:
              Math.max(16, Math.min(CARD_W - 16, rect.left + rect.width / 2 - pos.left)) - ARROW,
            [pos.side === "below" ? "top" : "bottom"]: -ARROW,
          }
        : {
            top:
              Math.max(16, Math.min(cardHeight - 16, rect.top + rect.height / 2 - pos.top)) - ARROW,
            [pos.side === "right" ? "left" : "right"]: -ARROW,
          }
      : null;

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed z-40 rounded-md transition-all duration-200",
            action && "tour-pulse",
          )}
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            // The amber ring and, beyond it, a faint dimming of everything else, in one shadow.
            boxShadow:
              "0 0 0 4px color-mix(in oklch, var(--review) 75%, transparent), 0 0 0 9999px rgb(20 33 61 / 0.08)",
          }}
        />
      )}
      <Card
        role="dialog"
        aria-label="Tour"
        ref={(el) => {
          if (el && el.offsetHeight !== cardHeight) setCardHeight(el.offsetHeight);
        }}
        className="fixed z-50 gap-3 overflow-visible py-4 shadow-lg transition-[top,left] duration-200"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
      >
        {arrow && (
          <span
            aria-hidden
            className="absolute size-4 rotate-45 bg-card ring-1 ring-foreground/10"
            style={{
              ...arrow,
              // Only the two edges that face out of the card should show the ring.
              clipPath:
                pos.side === "below"
                  ? "polygon(0 0, 100% 0, 0 100%)"
                  : pos.side === "above"
                    ? "polygon(100% 0, 100% 100%, 0 100%)"
                    : pos.side === "right"
                      ? "polygon(0 0, 0 100%, 100% 100%)"
                      : "polygon(0 0, 100% 0, 100% 100%)",
            }}
          />
        )}
        <CardHeader className="relative px-4 pr-10">
          <CardDescription>
            Step {index + 1} of {STEPS.length}
          </CardDescription>
          <CardTitle className="font-serif text-lg font-normal">{step.title}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-7"
            onClick={() => onClose(false)}
            aria-label="Close the tour"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-4 text-sm leading-relaxed">
          <p>{step.body}</p>
          <div className="flex items-center justify-between gap-3">
            {action ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-review">
                <MousePointerClick className="size-3.5" aria-hidden />
                Click the highlighted control
              </span>
            ) : (
              <span />
            )}
            {last ? (
              <Button
                size="sm"
                onClick={() => {
                  markDone();
                  onClose(true);
                }}
              >
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                variant={action ? "ghost" : "default"}
                onClick={() => setIndex(index + 1)}
              >
                {action ? "Skip" : "Next"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
