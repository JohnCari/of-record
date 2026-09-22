import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SearchHit } from "@/lib/courtlistener/client";
import type { Passage } from "@/lib/okf/parse";
import { ResultRows, TextLines } from "./placeholders";

type Opened = { hit: SearchHit; passages: Passage[] | null; error?: string };

/** Case-law search against CourtListener, for reading. Found cases are not added to the draft. */
export function CaseSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);

  async function search(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    setError(null);
    setOpened(null);
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const body = await response.json().catch(() => ({}));
    setSearching(false);
    if (!response.ok) {
      setError(body.error ?? "The search did not run.");
      return;
    }
    setHits(body.hits ?? []);
  }

  async function open(hit: SearchHit) {
    const id = hit.opinionIds[0];
    if (!id) {
      setOpened({ hit, passages: null, error: "CourtListener has no text for this case." });
      return;
    }
    setOpened({ hit, passages: null });
    const response = await fetch(`/api/search/opinion/${id}`);
    const body = await response.json().catch(() => ({}));
    setOpened({
      hit,
      passages: response.ok ? body.passages : null,
      error: response.ok ? undefined : (body.error ?? "The opinion could not be loaded."),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form onSubmit={search} className="flex gap-2 border-b p-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Case name, words, or a citation"
          aria-label="Search case law"
        />
        <Button type="submit" size="sm" disabled={searching || query.trim().length < 3}>
          <Search aria-hidden /> Search
        </Button>
      </form>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {opened ? (
            <>
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setOpened(null)}>
                <ArrowLeft aria-hidden /> Back to results
              </Button>
              <h2 className="font-serif text-lg leading-snug">{opened.hit.caseName}</h2>
              <p className="text-xs text-muted-foreground">
                {meta(opened.hit)}{" "}
                <a
                  href={opened.hit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  Open on CourtListener <ExternalLink className="size-3" aria-hidden />
                </a>
              </p>
              {opened.error && (
                <Alert>
                  <AlertDescription>{opened.error}</AlertDescription>
                </Alert>
              )}
              {!opened.error && opened.passages === null && <TextLines lines={10} />}
              {opened.passages?.map((passage) => (
                <p key={passage.index} className="font-serif text-[0.95rem] leading-relaxed">
                  {passage.text}
                </p>
              ))}
            </>
          ) : (
            <>
              {error && (
                <Alert>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {searching && <ResultRows />}
              {!searching && hits === null && (
                <p className="text-sm text-muted-foreground">
                  Search real opinions on CourtListener and read them here. The draft cites only
                  cases it has checked.
                </p>
              )}
              {!searching && hits?.length === 0 && (
                <p className="text-sm text-muted-foreground">No cases found for that.</p>
              )}
              {!searching &&
                hits?.map((hit) => (
                  <button
                    key={hit.clusterId}
                    type="button"
                    onClick={() => open(hit)}
                    className="rounded-md border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block font-serif leading-snug">{hit.caseName}</span>
                    <span className="block text-xs text-muted-foreground">{meta(hit)}</span>
                  </button>
                ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function meta(hit: SearchHit): string {
  return [hit.citations[0], hit.court, hit.dateFiled.slice(0, 4)].filter(Boolean).join(", ");
}
