import { findSpans, type Entity } from "@/lib/anonymizer";
import { alignTokens, levenshtein, normalize, tokenize, type Alignment } from "@/lib/align";
import type { GeoWord, PageGeometry, RedactionBox } from "@/lib/document";

// The visual redaction derives from the very same spans that anonymize()
// masks, so the black boxes on the page and the asterisks in the text can
// never disagree.

export type PlacedWord = GeoWord & { page: number };

export function flattenWords(pages: PageGeometry[]): PlacedWord[] {
  return pages.flatMap((p, page) => p.words.map((w) => ({ ...w, page })));
}

/** Alignment of the text's tokens onto the page words. Depends only on text and pages, so memoise it. */
export function alignText(text: string, pages: PageGeometry[]): Alignment {
  return alignTokens(tokenize(text).map(normalize), flattenWords(pages).map((w) => normalize(w.text)));
}

/** Index (in whitespace-token order) of every token touched by an enabled entity. */
export function maskedTokens(text: string, entities: Entity[]): { index: number; entityId: string }[] {
  const spans = findSpans(text, entities.filter((e) => e.enabled));
  if (!spans.length) return [];
  const out: { index: number; entityId: string }[] = [];
  let s = 0;
  let index = 0;
  for (const m of text.matchAll(/\S+/g)) {
    const a = m.index, b = a + m[0].length;
    while (s < spans.length && spans[s]!.end <= a) s++;
    const span = spans[s];
    if (span && span.start < b && span.end > a) out.push({ index, entityId: span.entity.id });
    index++;
  }
  return out;
}

/**
 * Boxes to paint over the page for the masked words. Neighbouring words of
 * the same entity on the same line merge into one box; `unplaced` counts the
 * masked words that have no position (edited text, or words the OCR missed).
 */
export function redactionBoxes(text: string, entities: Entity[], pages: PageGeometry[], alignment: Alignment): { boxes: RedactionBox[]; unplaced: number } {
  const words = flattenWords(pages);
  const boxes: (RedactionBox & { line: number })[] = [];
  let unplaced = 0;
  let last: (RedactionBox & { line: number }) | null = null;
  const rescued = rescueMasked(text, entities, words, alignment);
  for (const { index, entityId } of maskedTokens(text, entities)) {
    const aligned = (alignment.start[index] ?? -1) >= 0;
    const s = aligned ? alignment.start[index]! : rescued.get(index) ?? -1, e = aligned ? alignment.end[index]! : rescued.get(index) ?? -1;
    if (s < 0) { unplaced++; last = null; continue; }
    for (let k = s; k <= e; k++) {
      const w = words[k];
      if (!w) continue;
      const page = pages[w.page]!;
      const pad = Math.max(1, w.h * 0.15);
      const x = Math.max(0, w.x - pad), y = Math.max(0, w.y - pad);
      const box = { page: w.page, x, y, w: Math.min(page.width, w.x + w.w + pad) - x, h: Math.min(page.height, w.y + w.h + pad) - y, entityId, line: w.line };
      // Same entity, same line, within a line-height of the previous word (justified text has wide gaps).
      if (last && last.page === box.page && last.line === box.line && last.entityId === entityId && box.x - (last.x + last.w) < w.h * 1.2 && box.x >= last.x) {
        const right = Math.max(last.x + last.w, box.x + box.w), bottom = Math.max(last.y + last.h, box.y + box.h);
        last.y = Math.min(last.y, box.y); last.w = right - last.x; last.h = bottom - last.y;
      } else {
        last = box;
        boxes.push(last);
      }
    }
  }
  return { boxes: boxes.map(({ line: _line, ...b }) => b), unplaced };
}

/**
 * A second chance for masked tokens the in-order alignment missed: when the
 * backend read a scan in another order than the OCR here ("apólice nº …"
 * before "Seguro de saúde"), the in-order pass loses those lines. Look for the
 * word near where its placed neighbours landed. Short words must fall between
 * those neighbours, so a "de" never lands on some other "de" on the page.
 */
function rescueMasked(text: string, entities: Entity[], words: PlacedWord[], alignment: Alignment): Map<number, number> {
  const found = new Map<number, number>();
  const masked = maskedTokens(text, entities);
  if (!masked.some(({ index }) => (alignment.start[index] ?? -1) < 0)) return found;
  const tokens = tokenize(text);
  const used = new Uint8Array(words.length);
  for (let i = 0; i < tokens.length; i++) for (let k = alignment.start[i] ?? -1; k >= 0 && k <= (alignment.end[i] ?? -1); k++) used[k] = 1;
  const keys = words.map((w) => normalize(w.text));
  const placedBefore = (i: number) => { for (let k = i - 1; k >= 0; k--) if ((alignment.end[k] ?? -1) >= 0) return alignment.end[k]!; return -1; };
  const placedAfter = (i: number) => { for (let k = i + 1; k < tokens.length; k++) if ((alignment.start[k] ?? -1) >= 0) return alignment.start[k]!; return words.length; };
  for (const { index } of masked) {
    if ((alignment.start[index] ?? -1) >= 0) continue;
    const raw = tokens[index]!, key = normalize(raw);
    const lo = placedBefore(index), hi = placedAfter(index);
    const slack = key.length >= 4 ? 20 : 0;
    const from = Math.max(0, Math.min(lo, hi) - slack), to = Math.min(words.length - 1, Math.max(lo, hi) + slack);
    const fits = (k: number) => key
      ? keys[k] === key || (key.length >= 5 && levenshtein(key, keys[k]!, Math.floor(key.length / 5)) <= Math.floor(key.length / 5))
      // Only symbols ("€"): the page word that carries them, glued or not ("€62.500").
      : words[k]!.text.includes(raw);
    let best = -1;
    for (let k = from; k <= to; k++) {
      if ((used[k] && key) || !fits(k)) continue;
      if (best < 0 || Math.abs(k - lo) < Math.abs(best - lo)) best = k;
    }
    if (best >= 0) { found.set(index, best); if (key) used[best] = 1; }
  }
  return found;
}
