import { describe, it, expect } from "vitest";
import { anonymize, anonymizeRuns, type Entity } from "@/lib/anonymizer";

const e = (text: string, enabled = true): Entity => ({ id: text, text, category: "outro", reason: "", gdpr_basis: "", enabled });

describe("anonymize", () => {
  it("replaces each word with a single *", () => {
    expect(anonymize("Nome: Maria Conceição Oliveira Santos", [e("Maria Conceição Oliveira Santos")])).toBe("Nome: * * * *");
    expect(anonymize("Telefone: +351 912 345 678", [e("+351 912 345 678")])).toBe("Telefone: * * * *");
    expect(anonymize("Email: maria.santos@emailpessoal.pt", [e("maria.santos@emailpessoal.pt")])).toBe("Email: *");
  });
  it("removes empty lines and skips disabled entities", () => {
    expect(anonymize("A Maria\n\nB Maria", [e("Maria", false)])).toBe("A Maria\nB Maria");
  });
});

describe("anonymize: whole words and backend positions", () => {
  it("does not mask inside longer words or numbers", () => {
    expect(anonymize("Ana e Anabela", [e("Ana")])).toBe("* e Anabela");
    expect(anonymize("CVV 123) N.º 1234/25", [e("123")])).toBe("CVV *) N.º 1234/25");
    expect(anonymize("Nome: Maria Santos, 47", [e("Maria Santos")])).toBe("Nome: * *, 47");
  });

  it("masks backend items only where the backend found them", () => {
    const text = "Mãe: Ana\nAna é o nome da sala";
    const ana: Entity = { ...e("Ana"), at: [{ line: 1, first: 1, last: 1 }] };
    expect(anonymize(text, [ana])).toBe("Mãe: *\nAna é o nome da sala");
    expect(anonymize(text, [{ ...ana, enabled: false }])).toBe(text);
  });

  it("keeps the punctuation around a masked word, as the backend does", () => {
    const text = "Filhos: 2 (Pedro, 15 anos)\n(validade 09/27, CVV 123)";
    const pedro: Entity = { ...e("(Pedro,"), at: [{ line: 1, first: 2, last: 2 }] };
    const card: Entity = { ...e("09/27,"), at: [{ line: 2, first: 1, last: 1 }] };
    const cvv: Entity = { ...e("123)"), at: [{ line: 2, first: 3, last: 3 }] };
    expect(anonymize(text, [pedro, card, cvv])).toBe("Filhos: 2 (*, 15 anos)\n(validade *, CVV *)");
    expect(anonymize("Morada: Rua das Flores, 123", [e("Rua das Flores, 123")])).toBe("Morada: * * *, *");
  });

  it("falls back to text search when the positions do not fit the text", () => {
    const moved: Entity = { ...e("Rui"), at: [{ line: 9, first: 0, last: 0 }] };
    expect(anonymize("Doente: Rui", [moved])).toBe("Doente: *");
  });
});

describe("anonymizeRuns", () => {
  it("tags each mask with its entity and joins to anonymize()", () => {
    const text = "Rua das Flores,  \n\nJoão Silva e Rua das Flores";
    const ents = [e("Rua das Flores"), e("João Silva")];
    const runs = anonymizeRuns(text, ents);
    expect(runs.map((r) => r.text).join("")).toBe(anonymize(text, ents));
    expect(runs).toEqual([
      { text: "* * *", entityId: "Rua das Flores" }, { text: ",\n", entityId: undefined },
      { text: "* *", entityId: "João Silva" }, { text: " e ", entityId: undefined },
      { text: "* * *", entityId: "Rua das Flores" },
    ]);
  });
});
