import { ExternalLink, MousePointerClick } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Empty } from "./placeholders";
import { Quoted } from "./quoted";
import {
  type Adjudication,
  type Sentence,
  STANDING,
  shortCite,
  standingOf,
  verdictLabel,
} from "./status";

export function EvidencePanel({
  draftId,
  sentence,
  adjudication,
  readOnly,
  onOpenSource,
}: {
  draftId: string;
  sentence: Sentence | null;
  adjudication?: Adjudication;
  readOnly: boolean;
  onOpenSource: (sourceId: string, quotes: string[]) => void;
}) {
  const [deciding, setDeciding] = useState<"accept" | "strike" | null>(null);

  if (!sentence) {
    return (
      <Empty icon={MousePointerClick}>Select a sentence to see its source and its checks.</Empty>
    );
  }

  const standing = standingOf(sentence, adjudication);
  const meta = STANDING[standing];
  const Icon = meta.icon;
  const checks = sentence.verification?.checks ?? [];
  const quotes = [...sentence.recordCites, ...sentence.authorityCites].map((c) => c.quote);
  const canDecide = !readOnly && (standing === "blocked" || standing === "review");

  return (
    <ScrollArea className="h-full" data-tour="evidence">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 size-5 shrink-0", meta.text)} aria-hidden />
          <div>
            <p className={cn("font-medium", meta.text)}>{meta.label}</p>
            <p className="text-sm text-muted-foreground">{meta.explain}</p>
          </div>
        </div>

        <blockquote className="border-l-2 border-border pl-3 font-serif text-[0.95rem] leading-relaxed">
          {sentence.text}
        </blockquote>

        {adjudication && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">Your reason: </span>
            {adjudication.reason}
          </p>
        )}

        <Separator />

        {checks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {sentence.verification
              ? "Cites nothing and asserts nothing new. Nothing to check."
              : "Not checked yet."}
          </p>
        )}

        {checks.map((check, i) => {
          const failed = check.verdict !== "verified";
          const cite =
            check.target === "record" && check.citeIndex !== null
              ? shortCite(
                  sentence.recordCites[check.citeIndex]?.docId ?? "",
                  check.evidence?.section,
                )
              : check.target === "authority" && check.citeIndex !== null
                ? sentence.authorityCites[check.citeIndex]?.caseName
                : "This sentence";
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: checks are an ordered, immutable list
            <div key={i} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{cite}</span>
                <Badge variant={failed ? "destructive" : "secondary"}>
                  {verdictLabel(check.verdict)}
                </Badge>
                <Badge variant="outline">
                  {check.stage === "code"
                    ? "Checked word for word"
                    : `The judge: ${Math.round((check.confidence ?? 0) * 100)}% sure`}
                </Badge>
              </div>
              {failed && <p className="text-sm text-muted-foreground">{check.reason}</p>}
              {check.evidence && (
                <div className="rounded-md border bg-card p-3">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {check.evidence.sourceTitle}
                    {check.evidence.section ? `, ${check.evidence.section}` : ""}
                  </p>
                  <p className="font-serif text-[0.95rem] leading-relaxed">
                    <Quoted text={check.evidence.passage} quotes={quotes} />
                  </p>
                  <div className="mt-2 flex gap-2">
                    {check.target === "record" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenSource(check.evidence?.sourceId ?? "", quotes)}
                      >
                        Open in the record
                      </Button>
                    )}
                    {check.evidence.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={check.evidence.url} target="_blank" rel="noreferrer">
                          Read the opinion <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {canDecide && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                Open until you decide. Your reason is kept with the sentence.
              </p>
              <div className="flex gap-2" data-tour="decide">
                <Button variant="outline" onClick={() => setDeciding("accept")}>
                  Accept
                </Button>
                <Button variant="outline" onClick={() => setDeciding("strike")}>
                  Strike
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <DecideDialog
        draftId={draftId}
        sentenceId={sentence.sentenceId}
        decision={deciding}
        onClose={() => setDeciding(null)}
      />
    </ScrollArea>
  );
}

function DecideDialog({
  draftId,
  sentenceId,
  decision,
  onClose,
}: {
  draftId: string;
  sentenceId: string;
  decision: "accept" | "strike" | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const verb = decision === "accept" ? "Accept" : "Strike";

  async function save() {
    setSaving(true);
    const response = await fetch(`/api/drafts/${draftId}/adjudicate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentenceId, decision, reason }),
    });
    setSaving(false);
    if (!response.ok) {
      const { error } = await response
        .json()
        .catch(() => ({ error: "The decision was not saved." }));
      toast.error(error);
      return;
    }
    toast.success(decision === "accept" ? "Sentence accepted" : "Sentence struck");
    setReason("");
    onClose();
  }

  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} this sentence</DialogTitle>
          <DialogDescription>
            Your decision overrides the check. It is kept with the sentence and your reason.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">Why?</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              decision === "accept"
                ? "For example: the declaration at paragraph 8 does establish this."
                : "For example: the record does not support the date."
            }
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || reason.trim().length < 3}>
            {verb} sentence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
