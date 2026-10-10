import type { GeoWord } from "@/lib/document";

// Turns what pdf.js and tesseract report into lines of text plus one box per
// word. Pure, so it runs in the tests without a canvas.

/** pdf.js Util.transform: m1 × m2 for [a b c d e f] matrices. */
export function mul(m1: number[], m2: number[]): number[] {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!,
  ];
}

export interface TextItemLike { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean }
export interface ViewportLike { transform: number[]; scale: number }

interface CharBox { x: number; y: number; w: number; h: number }

/**
 * Approximate advance width of a character, in ems of a proportional font
 * (Helvetica-like). pdf.js only reports the width of a whole run, so each
 * character gets a share in proportion to this; "i" and ":" take much less
 * than "m" or "W", which keeps a word's box from drifting along the run.
 */
export function charWeight(ch: string): number {
  const base = ch.normalize("NFD")[0] ?? ch;
  if (base === " " || base === " ") return 0.28;
  if (/[.,:;!|'`]/.test(base)) return 0.28;
  if (/[ijl]/.test(base)) return 0.22;
  if (/[ftrI()\[\]{}\-\/\\]/.test(base)) return 0.33;
  if (/[mwMW@%]/.test(base)) return 0.85;
  if (/[\p{Lu}]/u.test(base)) return base === "J" ? 0.5 : 0.68;
  if (/[\p{N}]/u.test(base)) return 0.56;
  if (/[\p{L}]/u.test(base)) return 0.55;
  if (/[一-鿿぀-ヿ]/.test(base)) return 1;
  return 0.6;
}

/**
 * Lines and word boxes of a text-layer page. The text is built exactly as
 * extractPdfText always did (items concatenated, hasEOL breaks the line).
 * Each character gets a share of its item's width proportional to its
 * approximate glyph width; a word's box is the union of its characters, so a
 * word split across two items still gets one box.
 */
export function wordsFromTextItems(items: TextItemLike[], viewport: ViewportLike, firstLine: number): { lines: string[]; words: GeoWord[] } {
  const lines: string[] = [];
  const words: GeoWord[] = [];
  let line = "";
  let boxes: (CharBox | null)[] = [];
  const flush = () => {
    const text = line.replace(/[ \t]+$/, "");
    if (text.length) {
      const n = firstLine + lines.length;
      for (const m of text.matchAll(/\S+/g)) {
        const chars = boxes.slice(m.index, m.index + m[0].length).filter((b): b is CharBox => b !== null);
        if (!chars.length) continue;
        const x0 = Math.min(...chars.map((b) => b.x)), y0 = Math.min(...chars.map((b) => b.y));
        const x1 = Math.max(...chars.map((b) => b.x + b.w)), y1 = Math.max(...chars.map((b) => b.y + b.h));
        words.push({ text: m[0], line: n, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    lines.push(text);
    line = ""; boxes = [];
  };
  for (const item of items) {
    const str = item.str ?? "";
    if (str.length) {
      const tx = item.transform ? mul(viewport.transform, item.transform) : null;
      const chars = [...str];
      if (tx) {
        const fontH = Math.hypot(tx[2]!, tx[3]!) || (item.height ?? 0) * viewport.scale;
        const w = (item.width ?? 0) * viewport.scale;
        const upright = Math.abs(tx[1]!) < 1e-6 && Math.abs(tx[2]!) < 1e-6;
        const box: CharBox = { x: tx[4]!, y: tx[5]! - fontH, w, h: fontH * 1.15 };
        if (!upright) {
          // Rotated run: every character shares the run's axis-aligned box.
          // The run advances along (tx[0], tx[1]) and its ascent along (tx[2], tx[3]).
          const run = Math.hypot(tx[0]!, tx[1]!) || 1;
          const dx = [tx[0]! / run * w, tx[1]! / run * w], up = [tx[2]! / (fontH || 1) * fontH, tx[3]! / (fontH || 1) * fontH];
          const xs = [0, dx[0]!, up[0]!, dx[0]! + up[0]!].map((v) => v + tx[4]!), ys = [0, dx[1]!, up[1]!, dx[1]! + up[1]!].map((v) => v + tx[5]!);
          box.x = Math.min(...xs); box.y = Math.min(...ys); box.w = Math.max(...xs) - box.x; box.h = Math.max(...ys) - box.y;
          for (const _ of chars) boxes.push({ ...box });
        } else {
          const weights = chars.map(charWeight);
          const total = weights.reduce((a, b) => a + b, 0) || 1;
          let x = box.x;
          weights.forEach((wt) => { const cw = w * wt / total; boxes.push({ x, y: box.y, w: cw, h: box.h }); x += cw; });
        }
      } else for (const _ of chars) boxes.push(null);
      // Boxes are per UTF-16 unit for slicing by match index; pad astral characters.
      let units = 0; for (const c of chars) units += c.length;
      if (units !== chars.length) {
        const perChar = boxes.splice(boxes.length - chars.length, chars.length);
        chars.forEach((c, i) => { for (let k = 0; k < c.length; k++) boxes.push(perChar[i] ?? null); });
      }
      line += str;
    }
    if (item.hasEOL) flush();
  }
  if (line) flush();
  return { lines, words };
}

export interface OcrWordLike { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface OcrLineLike { words: OcrWordLike[] }

/** Lines and word boxes of an OCR'd page, converting from render pixels back to page units. */
export function wordsFromOcrLines(ocrLines: OcrLineLike[], scale: number, firstLine: number): { lines: string[]; words: GeoWord[] } {
  const lines: string[] = [];
  const words: GeoWord[] = [];
  const s = scale || 1;
  for (const l of ocrLines) {
    const tokens = l.words.map((w) => ({ ...w, text: w.text.trim() })).filter((w) => w.text.length);
    if (!tokens.length) continue;
    const n = firstLine + lines.length;
    lines.push(tokens.map((w) => w.text).join(" "));
    for (const w of tokens) {
      // A token with inner spaces is still one OCR word; split it so word counts match the text.
      const parts = w.text.split(/\s+/).filter(Boolean);
      const pw = (w.bbox.x1 - w.bbox.x0) / parts.length;
      parts.forEach((p, i) => words.push({ text: p, line: n, x: (w.bbox.x0 + pw * i) / s, y: w.bbox.y0 / s, w: pw / s, h: (w.bbox.y1 - w.bbox.y0) / s }));
    }
  }
  return { lines, words };
}
