import { Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACCEPT, ExtractError, extractDocument, FORMATS, MAX_FILES } from "@/lib/cases/extract";

/** Four fields and a button. The files are read here in the browser; only their text is sent. */
export function AttachCaseDialog({
  onAttached,
  locked = false,
}: {
  onAttached: (matterId: string) => void;
  /** The tour shows how a case is drafted, so attaching waits until it has been walked once. */
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState("");
  const [court, setCourt] = useState("");
  const [motion, setMotion] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = caption.trim() && court.trim() && motion.trim() && files.length > 0 && !busy;

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (files.length > MAX_FILES) {
      setError(`Attach at most ${MAX_FILES} files.`);
      return;
    }
    const documents = [];
    try {
      for (const [i, file] of files.entries()) {
        setBusy(`Reading ${file.name} (${i + 1} of ${files.length})…`);
        documents.push(await extractDocument(file));
      }
    } catch (e) {
      setBusy(null);
      setError(e instanceof ExtractError ? e.message : "A file could not be read.");
      return;
    }
    setBusy("Working out what the motion must show. About a minute.");
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: caption.trim(),
        court: court.trim(),
        motion: motion.trim(),
        documents,
      }),
    }).catch(() => null);
    if (!response) {
      setBusy(null);
      setError("The case could not be sent. Check your connection and try again.");
      return;
    }
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "The case could not be attached.");
      return;
    }
    toast.success("Case attached. Draft the motion when ready.");
    setOpen(false);
    setCaption("");
    setCourt("");
    setMotion("");
    setFiles([]);
    onAttached(body.matterId);
  }

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button gets no pointer events, so the wrapper carries the tooltip. */}
          <span className="inline-flex rounded-md">
            <Button variant="outline" size="sm" disabled>
              <Paperclip aria-hidden /> Attach a case
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-64">
          Finish the tour first. It shows how a case is drafted.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Paperclip aria-hidden /> Attach a case
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Attach a case</DialogTitle>
            <DialogDescription>
              {FORMATS}. Up to {MAX_FILES} files, read on your machine. Scanned images cannot be
              read.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="caption">Case name</Label>
            <Input
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Smith v. Jones"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="court">Court</Label>
            <Input
              id="court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="District Court, Denver County, Colorado"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="motion">What does the motion ask for?</Label>
            <Textarea
              id="motion"
              value={motion}
              onChange={(e) => setMotion(e.target.value)}
              placeholder="Smith moves for summary judgment that Jones breached the lease by failing to pay rent after March 2024."
              rows={2}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="files">Filings</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>
          {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
          {error && <p className="text-sm text-blocked">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={!!busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              Attach
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
