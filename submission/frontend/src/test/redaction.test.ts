import { describe, it, expect } from "vitest";
import { alignText, maskedTokens, redactionBoxes } from "@/lib/redaction";
import { anonymize, SAMPLE, type Entity } from "@/lib/anonymizer";
import type { PageGeometry } from "@/lib/document";

const ent = (id: string, text: string, extra: Partial<Entity> = {}): Entity => ({ id, text, category: "nome", reason: "", gdpr_basis: "", enabled: true, ...extra });

/** A fake page: every word 50 wide and 10 high, ten per line. */
function pageFor(text: string): PageGeometry {
  const words = text.split("\n").flatMap((line, l) => line.split(/\s+/).filter(Boolean).map((w, i) => ({ text: w, line: l + 1, x: 10 + i * 60, y: 20 + l * 30, w: 50, h: 10 })));
  return { width: 700, height: 1000, words, ocr: false };
}

describe("maskedTokens", () => {
  it("marks exactly the words anonymize() turns into asterisks", () => {
    const entities = [ent("a", "Maria Conceição Oliveira Santos"), ent("b", "097865413"), ent("c", "Rua das Flores, 123, Apt 45, Sacavém, Lisboa"), ent("d", "maria.santos@emailpessoal.pt")];
    const masked = maskedTokens(SAMPLE, entities);
    expect(masked.length).toBe(anonymize(SAMPLE, entities).split("*").length - 1);
    expect(masked.filter((m) => m.entityId === "a")).toHaveLength(4);
  });

  it("uses the backend positions when the entity has them", () => {
    const text = "Nome: Rui Costa\nAssina: Rui Costa";
    const e = ent("x", "Rui Costa", { at: [{ line: 2, first: 1, last: 2 }] });
    expect(maskedTokens(text, [e]).map((m) => m.index)).toEqual([4, 5]);
    expect(maskedTokens(text, [{ ...e, enabled: false }])).toEqual([]);
  });
});

describe("redactionBoxes", () => {
  const text = "Nome: Maria Santos\nNIF: 097865413 fim";
  const pages = [pageFor(text)];

  it("merges neighbouring words of one entity and pads the box", () => {
    const { boxes, unplaced } = redactionBoxes(text, [ent("a", "Maria Santos"), ent("b", "097865413")], pages, alignText(text, pages));
    expect(unplaced).toBe(0);
    expect(boxes).toHaveLength(2);
    const [name, nif] = boxes;
    expect(name).toMatchObject({ page: 0, entityId: "a" });
    expect(name!.x).toBeCloseTo(70 - 1.5);
    expect(name!.w).toBeCloseTo(180 - 70 + 3);  // from the start of "Maria" to the end of "Santos", padded
    expect(nif).toMatchObject({ page: 0, entityId: "b" });
    expect(nif!.x).toBeCloseTo(70 - 1.5);
    expect(nif!.y).toBeCloseTo(50 - 1.5);
  });

  it("keeps separate boxes for separate entities and clamps to the page", () => {
    const tight: PageGeometry = { width: 100, height: 20, words: [{ text: "Ana", line: 1, x: 0, y: 0, w: 100, h: 20 }], ocr: true };
    const { boxes } = redactionBoxes("Ana", [ent("a", "Ana")], [tight], alignText("Ana", [tight]));
    expect(boxes[0]).toMatchObject({ x: 0, y: 0, w: 100, h: 20 });
  });

  it("counts masked words that have no position", () => {
    const edited = "Nome: Maria Santos\nNIF: 999999999 fim";  // the NIF was retyped after import
    const { boxes, unplaced } = redactionBoxes(edited, [ent("a", "Maria Santos"), ent("b", "999999999")], pages, alignText(edited, pages));
    expect(boxes).toHaveLength(1);
    expect(unplaced).toBe(1);
  });

  it("places words on the right page", () => {
    const two = [pageFor("Pagina um"), pageFor("Pagina dois Rui")];
    const t = "Pagina um\nPagina dois Rui";
    const { boxes } = redactionBoxes(t, [ent("r", "Rui")], two, alignText(t, two));
    expect(boxes).toEqual([expect.objectContaining({ page: 1, entityId: "r" })]);
  });
});
