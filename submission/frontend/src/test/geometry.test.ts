import { describe, it, expect } from "vitest";
import { mul, wordsFromOcrLines, wordsFromTextItems, type TextItemLike } from "@/lib/geometry";

// An A4 page at scale 1: pdf.js flips y so the origin is the top-left corner.
const viewport = { transform: [1, 0, 0, -1, 0, 842], scale: 1 };
const item = (str: string, x: number, baseline: number, width: number, hasEOL = false, size = 10): TextItemLike =>
  ({ str, transform: [size, 0, 0, size, x, baseline], width, height: size, hasEOL });

describe("mul", () => {
  it("multiplies like pdf.js Util.transform", () => {
    expect(mul([1, 0, 0, -1, 0, 842], [10, 0, 0, 10, 50, 700])).toEqual([10, 0, 0, -10, 50, 142]);
    expect(mul([2, 0, 0, 2, 5, 5], [1, 0, 0, 1, 1, 1])).toEqual([2, 0, 0, 2, 7, 7]);
  });
});

describe("wordsFromTextItems", () => {
  it("builds the same lines extractPdfText always did", () => {
    const { lines } = wordsFromTextItems([item("Nome: ", 50, 700, 30), item("Maria", 80, 700, 25, true), item("  ", 0, 0, 0, true), item("NIF 123", 50, 680, 35, true)], viewport, 1);
    expect(lines).toEqual(["Nome: Maria", "", "NIF 123"]);
  });

  it("gives every word one box in page units, top-left origin", () => {
    const { words } = wordsFromTextItems([item("Nome: ", 50, 700, 30), item("Maria", 80, 700, 25, true)], viewport, 1);
    expect(words.map((w) => w.text)).toEqual(["Nome:", "Maria"]);
    const [nome, maria] = words;
    expect(nome).toMatchObject({ line: 1, x: 50, w: 25 });  // 5 of the 6 characters of "Nome: "
    expect(nome!.y).toBeCloseTo(842 - 700 - 10);             // baseline minus the font height
    expect(nome!.h).toBeCloseTo(11.5);
    expect(maria).toMatchObject({ line: 1, x: 80, w: 25 });
  });

  it("joins a word split across two items into one box", () => {
    const { lines, words } = wordsFromTextItems([item("Ma", 100, 500, 12), item("ria", 112, 500, 18, true)], viewport, 7);
    expect(lines).toEqual(["Maria"]);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ text: "Maria", line: 7, x: 100, w: 30 });
  });

  it("numbers lines from firstLine and skips words without a position", () => {
    const { words } = wordsFromTextItems([{ str: "solto", hasEOL: true }, item("fixo", 10, 800, 20, true)], viewport, 4);
    expect(words).toEqual([expect.objectContaining({ text: "fixo", line: 5 })]);
  });

  it("gives rotated runs the axis-aligned box of the whole run", () => {
    // 90° counter-clockwise: the run goes up the page.
    const rotated: TextItemLike = { str: "Lado", transform: [0, 10, -10, 0, 300, 400], width: 40, height: 10, hasEOL: true };
    const { words } = wordsFromTextItems([rotated], viewport, 1);
    const w = words[0]!;
    expect(w.text).toBe("Lado");
    expect(w.h).toBeCloseTo(40);
    expect(w.w).toBeCloseTo(10);
    expect(w.x).toBeCloseTo(290);  // the glyphs' ascent points left of the baseline
    expect(w.y).toBeCloseTo(842 - 400 - 40);
  });

  it("keeps character boxes aligned with UTF-16 indices for astral characters", () => {
    const { words } = wordsFromTextItems([item("😀 ok", 0, 100, 30, true)], viewport, 1);
    expect(words.map((w) => w.text)).toEqual(["😀", "ok"]);
    expect(words[1]!.x).toBeCloseTo(15);  // four code points share 30 units; "ok" starts at the third
  });
});

describe("wordsFromOcrLines", () => {
  it("converts render pixels back to page units and numbers the lines", () => {
    const { lines, words } = wordsFromOcrLines([
      { words: [{ text: "Nome:", bbox: { x0: 100, y0: 200, x1: 200, y1: 240 } }, { text: " Maria ", bbox: { x0: 220, y0: 200, x1: 320, y1: 240 } }] },
      { words: [{ text: "  ", bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] },
      { words: [{ text: "NIF 123", bbox: { x0: 100, y0: 300, x1: 300, y1: 340 } }] },
    ], 2, 3);
    expect(lines).toEqual(["Nome: Maria", "NIF 123"]);
    expect(words).toEqual([
      { text: "Nome:", line: 3, x: 50, y: 100, w: 50, h: 20 },
      { text: "Maria", line: 3, x: 110, y: 100, w: 50, h: 20 },
      { text: "NIF", line: 4, x: 50, y: 150, w: 50, h: 20 },
      { text: "123", line: 4, x: 100, y: 150, w: 50, h: 20 },
    ]);
  });
});
