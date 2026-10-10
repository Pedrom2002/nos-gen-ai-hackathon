import type { PageGeometry, SourceDoc, SourceKind } from "@/lib/document";
import { wordsFromOcrLines } from "@/lib/geometry";
import { loadImagePage } from "@/lib/images";
import { recognize } from "@/lib/ocr";
import { canvasToBlob, disposePdf, readPdf, renderPdfPage } from "@/lib/pdf";

export interface ReadProgress { stage: "reading" | "ocr"; pct: number }

/** Opens a file the way the import needs it: its text, its pages and a thumbnail. */
export async function readSource(file: File, kind: SourceKind, onProgress: (p: ReadProgress) => void): Promise<SourceDoc> {
  onProgress({ stage: "reading", pct: 0 });
  if (kind === "text") return { kind, file, text: await file.text(), pages: [], ocr: false, previewUrl: null };
  if (kind === "image") {
    const canvas = await loadImagePage(file);
    const { width, height } = canvas;
    const image = await canvasToBlob(canvas, "image/jpeg", 0.9);
    const lines = await recognize(canvas, (pct) => onProgress({ stage: "ocr", pct }));
    canvas.width = canvas.height = 0;
    const { lines: textLines, words } = wordsFromOcrLines(lines, 1, 1);
    const page: PageGeometry = { width, height, words, ocr: true, image };
    return { kind, file, text: textLines.join("\n"), pages: [page], ocr: true, previewUrl: URL.createObjectURL(image) };
  }
  let stage: ReadProgress["stage"] = "reading";
  const { text, pages, ocr } = await readPdf(file, {
    ocr: (canvas, pct) => { stage = "ocr"; return recognize(canvas, pct); },
    onProgress: (pct) => onProgress({ stage, pct }),
  });
  let previewUrl: string | null = null;
  try {
    const thumb = pages[0]?.image ?? (await canvasToBlob(await renderPdfPage(file, 0, 320), "image/jpeg", 0.8));
    previewUrl = URL.createObjectURL(thumb);
  } catch { /* a preview is optional */ }
  return { kind, file, text, pages, ocr, previewUrl };
}

/** Frees what a loaded document holds in the browser. */
export function disposeSource(doc: SourceDoc | null): void {
  if (!doc) return;
  if (doc.previewUrl) URL.revokeObjectURL(doc.previewUrl);
  if (doc.kind === "pdf") disposePdf(doc.file);
}
