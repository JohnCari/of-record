// Reads a filing in the browser and sends only its text. The files themselves never leave the
// machine, and the request stays far below the 4.5 MB a Vercel function will accept, so a lawyer
// can attach the 8 MB PDF the court gave them. PDF.js and mammoth load on first use.

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 2_000_000;
/** Below this many non-space characters a PDF is a scan: pages of images with no text layer. */
export const SCAN_THRESHOLD = 200;

export const ACCEPT = ".pdf,.docx,.txt";
export const FORMATS = "PDF, Word (.docx) or .txt";

export type Extracted = { title: string; text: string };

const EXTENSION = /\.(pdf|docx|txt)$/i;

export class ExtractError extends Error {}

export async function extractDocument(file: File): Promise<Extracted> {
  const title = file.name.replace(EXTENSION, "").slice(0, 120) || "Filing";
  if (file.size > MAX_FILE_BYTES) throw new ExtractError(`${file.name} is over 25 MB.`);
  const kind = EXTENSION.exec(file.name)?.[1].toLowerCase();
  let text: string;
  if (kind === "txt") {
    text = await file.text();
  } else if (kind === "pdf") {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      text = (await extractText(pdf, { mergePages: true })).text;
    } catch {
      throw new ExtractError(`${file.name} could not be read as a PDF.`);
    }
    if (text.replace(/\s+/g, "").length < SCAN_THRESHOLD) {
      throw new ExtractError(
        `${file.name} is a scan with no text. Export it with text, or use Word or .txt.`,
      );
    }
  } else if (kind === "docx") {
    try {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    } catch {
      throw new ExtractError(`${file.name} could not be read as a Word document.`);
    }
  } else {
    throw new ExtractError(`${file.name}: only ${FORMATS} files are accepted.`);
  }
  if (!text.trim()) throw new ExtractError(`${file.name} has no readable text.`);
  return { title, text };
}

/** Reads every file, in order, and refuses the whole set on the first bad one. */
export async function extractDocuments(files: File[]): Promise<Extracted[]> {
  if (files.length === 0) throw new ExtractError("Attach at least one file.");
  if (files.length > MAX_FILES) throw new ExtractError(`Attach at most ${MAX_FILES} files.`);
  const documents: Extracted[] = [];
  let total = 0;
  for (const file of files) {
    const doc = await extractDocument(file);
    total += doc.text.length;
    if (total > MAX_TEXT_CHARS) {
      throw new ExtractError("That is more text than one case can hold here.");
    }
    documents.push(doc);
  }
  return documents;
}
