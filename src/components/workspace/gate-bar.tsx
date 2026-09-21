import { Lock, LockOpen, Stamp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Doc } from "../../../convex/_generated/dataModel";
import { type Adjudication, type Sentence, type Standing, standingOf } from "./status";

const COUNT_LABEL: Record<Standing, string> = {
  verified: "verified",
  accepted: "accepted by you",
  review: "for your review",
  blocked: "blocked",
  unverified: "not yet checked",
  struck: "struck by you",
  exempt: "pure argument",
};

const ORDER: Standing[] = [
  "verified",
  "accepted",
  "review",
  "blocked",
  "unverified",
  "struck",
  "exempt",
];

export function GateBar({
  draft,
  sentences,
  adjudications,
  readOnly,
  onJumpToOpen,
}: {
  draft: Doc<"drafts">;
  sentences: Sentence[];
  adjudications: Adjudication[];
  readOnly: boolean;
  onJumpToOpen: (sentenceId: string) => void;
}) {
  const [signing, setSigning] = useState(false);
  const decided = new Map(adjudications.map((a) => [a.sentenceId, a]));
  const standings = sentences.map((s) => ({
    s,
    standing: standingOf(s, decided.get(s.sentenceId)),
  }));
  const counts = new Map<Standing, number>();
  for (const { standing } of standings) counts.set(standing, (counts.get(standing) ?? 0) + 1);

  const open = standings.filter(({ standing }) =>
    (["blocked", "review", "unverified"] as Standing[]).includes(standing),
  );
  const signed = draft.status === "signed";
  const gateOpen = sentences.length > 0 && open.length === 0;

  async function sign() {
    setSigning(true);
    const response = await fetch(`/api/drafts/${draft._id}/sign`, { method: "POST" });
    setSigning(false);
    if (response.ok) toast.success("Draft signed");
    else {
      const body = await response.json().catch(() => ({}));
      toast.error(
        body.open
          ? `The gate refused: ${body.open.length} sentence${body.open.length === 1 ? " is" : "s are"} still open.`
          : (body.error ?? "The draft was not signed."),
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        {gateOpen || signed ? (
          <LockOpen className="size-4 text-verified" aria-hidden />
        ) : (
          <Lock className="size-4 text-blocked" aria-hidden />
        )}
        <span className="text-sm font-medium">
          {signed
            ? "Signed"
            : sentences.length === 0
              ? "Nothing to sign yet"
              : gateOpen
                ? "Every sentence is cleared"
                : `${open.length} sentence${open.length === 1 ? " needs" : "s need"} your decision`}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {ORDER.filter((standing) => counts.get(standing))
          .map((standing) => `${counts.get(standing)} ${COUNT_LABEL[standing]}`)
          .join(", ")}
      </p>

      <div className="ml-auto flex items-center gap-2">
        {open.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onJumpToOpen(open[0].s.sentenceId)}>
            Show me the next one
          </Button>
        )}
        {!readOnly && !signed && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={!gateOpen || signing}>
                <Stamp aria-hidden /> Sign the draft
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign this draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  Signing records that you reviewed the draft and that it may leave the workspace.
                  The gate is checked again at the moment you sign, against what is stored, and
                  refuses if any sentence has reopened.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not yet</AlertDialogCancel>
                <AlertDialogAction onClick={sign}>Sign the draft</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
