// Maps the tokens of the final text (as the backend returned it) onto the
// words that have a position on the page. On the text path both sides are
// identical and this is a single linear pass; when the backend re-read a PDF
// itself the lines and the odd word differ, so the match tolerates splits,
// merges and small OCR confusions and resyncs after a run of misses.

export const tokenize = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Comparison key: case, accents' composition and punctuation do not matter ("Lisboa," is "Lisboa"). */
export const normalize = (w: string): string => w.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** For token i of A, the inclusive range start[i]..end[i] of B, or -1 when nothing matched. */
export interface Alignment { start: Int32Array; end: Int32Array }

export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export function alignTokens(a: string[], b: string[], window = 40): Alignment {
  const start = new Int32Array(a.length).fill(-1);
  const end = new Int32Array(a.length).fill(-1);
  let j = 0;
  let misses = 0;
  const set = (i: number, s: number, e: number) => { start[i] = s; end[i] = e; j = e + 1; misses = 0; };
  for (let i = 0; i < a.length; i++) {
    const tok = a[i]!;
    if (!tok) continue; // pure punctuation: nothing to place, not a miss either
    if (j < b.length && b[j] === tok) { set(i, j, j); continue; }
    const limit = Math.min(b.length, j + window);
    // Exact match a little further on; short words need the next token to agree too.
    let found = -1;
    for (let k = j; k < limit; k++) {
      if (b[k] !== tok) continue;
      if (tok.length >= 4 || (a[i + 1] !== undefined && a[i + 1] === b[k + 1]) || i === a.length - 1) { found = k; break; }
    }
    if (found >= 0) { set(i, found, found); continue; }
    // B split one of our words ("Ruadas" vs "Rua" "das").
    let merged = "", n = 0, hit = false;
    for (let k = j; k < Math.min(b.length, j + 3); k++) {
      merged += b[k]; n++;
      if (merged === tok && n > 1) { set(i, j, j + n - 1); hit = true; break; }
      if (!tok.startsWith(merged)) break;
    }
    if (hit) continue;
    // B glued our words ("MariaSantos" vs "Maria" "Santos").
    for (let k = j; k < Math.min(b.length, j + 3) && !hit; k++) {
      const target = b[k]!;
      if (!target.startsWith(tok) || target === tok) continue;
      let acc = tok, m = 1;
      while (acc.length < target.length && i + m < a.length && target.startsWith(acc + a[i + m])) { acc += a[i + m]; m++; }
      if (acc === target && m > 1) {
        for (let d = 0; d < m; d++) { start[i + d] = k; end[i + d] = k; }
        j = k + 1; misses = 0; i += m - 1; hit = true;
      }
    }
    if (hit) continue;
    // OCR confusion (0/O, 1/l, rn/m): one edit per five characters.
    if (tok.length >= 5) {
      const max = Math.floor(tok.length / 5);
      for (let k = j; k < limit; k++) {
        if (levenshtein(tok, b[k]!, max) <= max) { found = k; break; }
      }
      if (found >= 0) { set(i, found, found); continue; }
    }
    misses++;
    if (misses > 25 && i + 2 < a.length) {
      // Lost: look for the next three tokens anywhere ahead and jump there.
      const far = Math.min(b.length - 2, j + 2000);
      for (let k = j; k < far; k++) {
        if (b[k] === a[i] && b[k + 1] === a[i + 1] && b[k + 2] === a[i + 2]) { set(i, k, k); break; }
      }
    }
  }
  return { start, end };
}
