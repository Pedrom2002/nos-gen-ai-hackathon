import { useEffect, useState } from "react";
import type { SourceDoc } from "@/lib/document";
import { canvasToBlob, renderPdfPage } from "@/lib/pdf";

/** Longest side of a displayed page: enough for a 900px column on a 2x screen, less on phones. */
function displaySide(): number {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  return Math.min(coarse ? 2048 : 3000, Math.round(1000 * dpr));
}

/**
 * Object URLs of the document's pages, rendered one at a time once `enabled`
 * and revoked when the document changes or the page unmounts. Pages the
 * import already rasterised (photos, scans) reuse that image.
 */
export function usePageImages(source: SourceDoc | null, enabled: boolean): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    if (!enabled || !source || !source.pages.length) { setUrls([]); return; }
    let cancelled = false;
    const made: string[] = [];
    setUrls(source.pages.map(() => null));
    (async () => {
      const side = displaySide();
      for (let i = 0; i < source.pages.length && !cancelled; i++) {
        try {
          const page = source.pages[i]!;
          let blob = page.image;
          if (!blob) {
            const canvas = await renderPdfPage(source.file, i, side);
            blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
            canvas.width = canvas.height = 0;
          }
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          made.push(url);
          setUrls((prev) => prev.map((u, k) => (k === i ? url : u)));
        } catch (e) { console.error(e); }
      }
    })();
    return () => { cancelled = true; for (const u of made) URL.revokeObjectURL(u); };
  }, [source, enabled]);
  return urls;
}
