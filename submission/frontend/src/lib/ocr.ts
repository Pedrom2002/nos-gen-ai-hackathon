import type { OcrLineLike } from "@/lib/geometry";

// Text recognition in the browser with tesseract.js. The worker, its wasm
// core and the Portuguese and English models load on first use (from the
// package's default CDN) and stay warm until clear() terminates them.
type Tesseract = typeof import("tesseract.js");
type Worker = Awaited<ReturnType<Tesseract["createWorker"]>>;

let worker: Promise<Worker> | null = null;
let onProgress: ((p: number) => void) | null = null;

function getWorker(): Promise<Worker> {
  worker ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    return createWorker(["por", "eng"], OEM.LSTM_ONLY, {
      logger: (m) => { if (m.status === "recognizing text") onProgress?.(m.progress); },
    });
  })().catch((e: unknown) => { worker = null; throw e; });
  return worker;
}

/** Lines of words with pixel boxes for a canvas or an image blob. */
export async function recognize(image: HTMLCanvasElement | Blob, progress?: (p: number) => void): Promise<OcrLineLike[]> {
  const w = await getWorker();
  onProgress = progress ?? null;
  try {
    const { data } = await w.recognize(image, {}, { text: true, blocks: true });
    return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({
      words: l.words.map((word) => ({ text: word.text, bbox: word.bbox })),
    }))));
  } finally {
    onProgress = null;
  }
}

export async function terminateOcr(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) await w.then((x) => x.terminate()).catch(() => {});
}
