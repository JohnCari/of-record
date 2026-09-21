import { normalize } from "@/lib/verify/locate";

/**
 * Renders a passage with the quoted words struck through in highlighter. The match uses the same
 * normalisation as the verifier, then maps back onto the original characters, so what is
 * highlighted is exactly what the verifier matched and nothing looser.
 */
export function Quoted({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges = quotes
    .flatMap((quote) => segmentsOf(quote).map((segment) => find(text, segment)))
    .filter((range): range is [number, number] => range !== null)
    .sort((a, b) => a[0] - b[0]);

  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="quoted">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function segmentsOf(quote: string): string[] {
  return normalize(quote)
    .replace(/^["']+|["']+$/g, "")
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .filter((segment) => segment.length > 0);
}

/** Finds a normalised segment in the original text and returns the original character range. */
function find(text: string, segment: string): [number, number] | null {
  // Build the normalised text one character at a time, remembering where each came from.
  const map: number[] = [];
  let normalized = "";
  for (let i = 0; i < text.length; i++) {
    const piece = normalize(text[i]) || (/\s/.test(text[i]) ? " " : "");
    if (piece === " " && normalized.endsWith(" ")) continue;
    for (const ch of piece) {
      normalized += ch;
      map.push(i);
    }
  }
  const at = normalized.indexOf(segment);
  if (at === -1) return null;
  return [map[at], map[at + segment.length - 1] + 1];
}
