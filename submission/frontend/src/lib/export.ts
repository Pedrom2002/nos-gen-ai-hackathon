import type { RedactionBox, SourceDoc } from "@/lib/document";
import { canvasToBlob, renderPdfPage } from "@/lib/pdf";

// Redacted copies of the source file, burned into pixels: an image or a PDF
// made of page images, so nothing under the black boxes survives in the file.

const EXPORT_SIDE = 3000;

async function pageCanvas(source: SourceDoc, index: number): Promise<HTMLCanvasElement> {
  const page = source.pages[index]!;
  if (page.image) {
    const bitmap = await createImageBitmap(page.image);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }
  return renderPdfPage(source.file, index, EXPORT_SIDE);
}

/** The page with its boxes painted, at the export resolution. */
export async function renderRedactedPage(source: SourceDoc, index: number, boxes: RedactionBox[]): Promise<HTMLCanvasElement> {
  const page = source.pages[index]!;
  const canvas = await pageCanvas(source, index);
  const ctx = canvas.getContext("2d")!;
  const s = canvas.width / page.width;
  ctx.fillStyle = "#000";
  for (const b of boxes) if (b.page === index) ctx.fillRect(Math.floor(b.x * s), Math.floor(b.y * s), Math.ceil(b.w * s), Math.ceil(b.h * s));
  return canvas;
}

export async function redactedImageBlob(source: SourceDoc, boxes: RedactionBox[]): Promise<Blob> {
  const canvas = await renderRedactedPage(source, 0, boxes);
  const blob = await canvasToBlob(canvas, "image/png");
  canvas.width = canvas.height = 0;
  return blob;
}

export async function redactedPdfBlob(source: SourceDoc, boxes: RedactionBox[], onProgress?: (p: number) => void): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  out.setProducer("Lethe");
  for (let i = 0; i < source.pages.length; i++) {
    const page = source.pages[i]!;
    const canvas = await renderRedactedPage(source, i, boxes);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
    canvas.width = canvas.height = 0;
    const image = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
    out.addPage([page.width, page.height]).drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    onProgress?.((i + 1) / source.pages.length);
  }
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
