// Uses the pdf.js "legacy" build: the modern build relies on very recent
// browser features (Map.getOrInsertComputed, Promise.withResolvers) and
// fails silently on Safari/iOS and older Chrome/Android.
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      line += item.str ?? "";
      if (item.hasEOL) { lines.push(line); line = ""; }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n").replace(/[ \t]+\n/g, "\n").trim();
}
