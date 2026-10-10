import type { PageGeometry } from "@/lib/document";
import { wordsFromOcrLines, wordsFromTextItems, type OcrLineLike, type TextItemLike } from "@/lib/geometry";

// Uses the pdf.js "legacy" build: the modern build relies on very recent
// browser features (Map.getOrInsertComputed, Promise.withResolvers) and
// fails silently on Safari/iOS and older Chrome/Android.
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type LoadingTask = ReturnType<PdfJs["getDocument"]>;
type PdfDocument = Awaited<LoadingTask["promise"]>;

let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  lib ??= (async () => {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    mod.GlobalWorkerOptions.workerSrc = worker;
    return mod;
  })();
  return lib;
}

// One parsed document per File: the import, the result page and the export
// all read the same PDF, and parsing it once keeps the pages' geometry stable.
const docs = new WeakMap<File, Promise<{ task: LoadingTask; doc: PdfDocument }>>();
function open(file: File): Promise<PdfDocument> {
  let entry = docs.get(file);
  if (!entry) {
    entry = (async () => {
      const task = (await pdfjs()).getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      return { task, doc: await task.promise };
    })();
    docs.set(file, entry);
  }
  return entry.then((e) => e.doc);
}

export function disposePdf(file: File): void {
  const entry = docs.get(file);
  docs.delete(file);
  void entry?.then((e) => e.task.destroy()).catch(() => {});
}

/** Pages with fewer non-space characters than this are treated as scans and go through OCR. */
const MIN_TEXT_CHARS = 10;
/** Longest side, in pixels, of the render handed to the OCR. */
const OCR_MAX_SIDE = 2200;

function canvasFor(width: number, height: number): [HTMLCanvasElement] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width); canvas.height = Math.round(height);
  return [canvas];
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type, quality));

export interface ReadPdfOptions {
  /** Reads a rendered page; the result lines carry one bbox per word in canvas pixels. */
  ocr: (canvas: HTMLCanvasElement, onProgress: (p: number) => void) => Promise<OcrLineLike[]>;
  /** 0..1 over the whole file. */
  onProgress?: (p: number) => void;
}

/**
 * The text of a PDF, as extractPdfText always built it, plus the geometry of
 * every word. Pages without a text layer are rendered and read by `ocr`.
 */
export async function readPdf(file: File, opts: ReadPdfOptions): Promise<{ text: string; pages: PageGeometry[]; ocr: boolean }> {
  const doc = await open(file);
  const pages: PageGeometry[] = [];
  const texts: string[] = [];
  let firstLine = 1;
  let ocr = false;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items as TextItemLike[];
    const chars = items.reduce((n, it) => n + (it.str ?? "").replace(/\s/g, "").length, 0);
    let result: { lines: string[]; words: PageGeometry["words"] };
    const geometry: PageGeometry = { width: viewport.width, height: viewport.height, words: [], ocr: false };
    if (chars >= MIN_TEXT_CHARS) {
      result = wordsFromTextItems(items, viewport, firstLine);
      opts.onProgress?.(i / doc.numPages);
    } else {
      ocr = geometry.ocr = true;
      const scale = Math.min(3, OCR_MAX_SIDE / Math.max(viewport.width, viewport.height));
      const scaled = page.getViewport({ scale });
      const [canvas] = canvasFor(scaled.width, scaled.height);
      await page.render({ canvas, viewport: scaled }).promise;
      const lines = await opts.ocr(canvas, (p) => opts.onProgress?.((i - 1 + p) / doc.numPages));
      result = wordsFromOcrLines(lines, scale, firstLine);
      geometry.image = await toBlob(canvas, "image/jpeg", 0.85);
      canvas.width = canvas.height = 0;
    }
    geometry.words = result.words;
    pages.push(geometry);
    texts.push(result.lines.join("\n"));
    firstLine += result.lines.length;
  }
  return { text: texts.join("\n").replace(/[ \t]+\n/g, "\n").trim(), pages, ocr };
}

export async function extractPdfText(file: File): Promise<string> {
  return (await readPdf(file, { ocr: async () => [] })).text;
}

/** Renders one page (0-based) with its longest side at most `maxSide` pixels. */
export async function renderPdfPage(file: File, index: number, maxSide: number): Promise<HTMLCanvasElement> {
  const doc = await open(file);
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
  const [canvas] = canvasFor(viewport.width, viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export { toBlob as canvasToBlob };
