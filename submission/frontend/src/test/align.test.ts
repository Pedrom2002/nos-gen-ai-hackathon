import { describe, it, expect } from "vitest";
import { alignTokens, normalize, tokenize } from "@/lib/align";

const align = (a: string, b: string) => {
  const r = alignTokens(tokenize(a).map(normalize), tokenize(b).map(normalize));
  return [...r.start].map((s, i) => (s < 0 ? null : [s, r.end[i]]));
};

describe("normalize", () => {
  it("ignores case, punctuation and composition", () => {
    expect(normalize("Lisboa,")).toBe("lisboa");
    expect(normalize("São")).toBe(normalize("São"));
    expect(normalize("—")).toBe("");
  });
});

describe("alignTokens", () => {
  it("maps identical sequences one to one, whatever the line breaks", () => {
    const text = "Nome: Maria Santos\nNIF: 097865413";
    expect(align(text, "Nome:   Maria\nSantos NIF:\n\n097865413")).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
  });

  it("handles a word the page split in two", () => {
    expect(align("Rua das Flores", "Ruadas Flores")).toEqual([[0, 0], [0, 0], [1, 1]]);
    expect(align("Ruadas Flores", "Rua das Flores")).toEqual([[0, 1], [2, 2]]);
  });

  it("tolerates OCR confusions in longer words", () => {
    expect(align("NIF 097865413 fim", "NIF O97865413 fim")).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(align("de", "do")).toEqual([null]);
  });

  it("matches short words only with confirmation from the next token", () => {
    expect(align("a b a c", "x a b a c")).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
  });

  it("recovers after a run of unmatched tokens", () => {
    const garbage = Array.from({ length: 40 }, (_, i) => `zz${i}`).join(" ");
    const r = align(`${garbage} fim do documento aqui`, "inicio fim do documento aqui");
    expect(r.slice(-4)).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(r.slice(0, 40).every((x) => x === null)).toBe(true);
  });

  it("leaves punctuation-only tokens unplaced without losing the cursor", () => {
    expect(align("Maria — Santos", "Maria Santos")).toEqual([[0, 0], null, [1, 1]]);
  });

  it("stays linear on a long identical document", () => {
    const words = Array.from({ length: 20000 }, (_, i) => `palavra${i % 97}`);
    const t0 = performance.now();
    const r = alignTokens(words, words);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(r.start[19999]).toBe(19999);
  });
});
