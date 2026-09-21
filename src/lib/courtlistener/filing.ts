import type { Passage } from "../okf/parse";

// The stamp ECF prints across the top of every page of a filed document, in the two forms this
// court used: "Case 1:09-cv-00799-SJJ -KLM Document 195 Filed 09/02/11 USDC Colorado Page 2 of 16"
// and "Case No. 1:09-cv-00799-SJJ-KLM Document 78-1 filed 12/10/09 USDC Colorado pg 1 of 18".
// Scanned filings garble parts of it, so the match is anchored on its two ends and kept short.
const PAGE_STAMP =
  /Case(?:\s+No\.)?\s+\d:\d\d-cv-\d{5}[\s\S]{0,140}?(?:pg|Page)\s+(\d+)\s+of(?:[ \t]*\n?[ \t]*\d+)?/gi;

const MIN_CHARS = 40;
const MAX_CHARS = 900;

/**
 * Turns the text of a filing into passages, one page at a time, with the page number kept as the
 * section so a cite can read "Doc. 78-1 at 4". The words are not changed: whitespace is collapsed
 * and page stamps are removed, and that is all.
 */
export function passagesFromFiling(plainText: string): Passage[] {
  const pages: { page: number; text: string }[] = [];
  let cursor = 0;
  let current = 1;
  PAGE_STAMP.lastIndex = 0;
  for (let m = PAGE_STAMP.exec(plainText); m !== null; m = PAGE_STAMP.exec(plainText)) {
    const before = plainText.slice(cursor, m.index);
    if (before.trim()) pages.push({ page: current, text: before });
    current = Number(m[1]);
    cursor = m.index + m[0].length;
  }
  const rest = plainText.slice(cursor);
  if (rest.trim()) pages.push({ page: current, text: rest });

  const passages: Passage[] = [];
  for (const { page, text } of pages) {
    for (const block of blocks(text)) {
      if (!readable(block)) continue;
      passages.push({ index: passages.length, section: `Page ${page}`, text: block });
    }
  }
  return passages;
}

/** Paragraphs where the text has them; otherwise sentence-bounded chunks of a readable size. */
function blocks(pageText: string): string[] {
  const out: string[] = [];
  let carry = "";
  for (const raw of rejoin(pageText.split(/\n\s*\n/))) {
    const paragraph = `${carry} ${raw.replace(/\s+/g, " ").trim()}`.trim();
    carry = "";
    if (!paragraph) continue;
    // A fragment too short to stand alone (a heading, a line number) joins what follows it.
    if (paragraph.length < MIN_CHARS) {
      carry = paragraph;
      continue;
    }
    out.push(...chunk(paragraph));
  }
  if (carry && out.length > 0) out[out.length - 1] = `${out[out.length - 1]} ${carry}`;
  else if (carry.length >= MIN_CHARS) out.push(carry);

  // A block that would be mistaken for markdown structure when written out is joined to the one
  // before it, so no character has to be escaped or altered.
  return out.reduce<string[]>((kept, block) => {
    if (/^(#|>|-{3,}$)/.test(block) && kept.length > 0)
      kept[kept.length - 1] = `${kept[kept.length - 1]} ${block}`;
    else kept.push(block);
    return kept;
  }, []);
}

/**
 * Scanned text breaks paragraphs in the middle of sentences. A block that does not end a sentence,
 * followed by one that starts in lower case, is one paragraph that was cut in two.
 */
function rejoin(rawBlocks: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawBlocks) {
    const block = raw.trim();
    const previous = out[out.length - 1];
    if (previous && !/[.?!:;"')\]]$/.test(previous) && /^[a-z(]/.test(block)) {
      out[out.length - 1] = `${previous} ${block}`;
    } else out.push(block);
  }
  return out;
}

function chunk(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHARS) return [paragraph];
  const out: string[] = [];
  let current = "";
  for (const sentence of paragraph.split(/(?<=[.?!]["')\]]?)\s+(?=[A-Z0-9("'])/)) {
    if (current && current.length + sentence.length > MAX_CHARS) {
      out.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) out.push(current);
  return out;
}

/** Scanned pages produce runs of symbols where there was a logo, a stamp or a signature. */
function readable(block: string): boolean {
  if (block.length < MIN_CHARS) return false;
  const letters = block.replace(/[^A-Za-z]/g, "").length;
  return letters / block.length >= 0.55;
}
