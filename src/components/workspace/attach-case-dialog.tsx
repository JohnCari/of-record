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

/** Four fields and a button. The files stay as uploaded; nothing is edited. */
export function AttachCaseDialog({ onAttached }: { onAttached: (matterId: string) => void }) {
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
    setBusy(
      `Reading ${files.length} file${files.length === 1 ? "" : "s"} and working out what the motion must show. About a minute.`,
    );
    const form = new FormData();
    form.set("caption", caption.trim());
    form.set("court", court.trim());
    form.set("motion", motion.trim());
    for (const file of files) form.append("files", file);
    const response = await fetch("/api/cases", { method: "POST", body: form });
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
              PDF files with text, or .txt. Up to 10 files. Scanned images cannot be read.
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
              accept=".pdf,.txt"
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
