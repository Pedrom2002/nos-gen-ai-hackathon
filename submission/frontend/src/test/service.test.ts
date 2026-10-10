import { describe, it, expect } from "vitest";
import { fromState, spanText, type DocumentState } from "@/services/anonymizer";

const state: DocumentState = {
  id: "abc123",
  name: "doc.txt",
  lines: ["Nome:  Rui Costa Lima", "Contacto: 916 222 333, rui@mail.pt", "Médico: Dr. Paulo Reis"],
  output: ["Nome:  * * *", "Contacto: * * * *", "Médico: Dr. * *"],
  items: [
    { id: "L1-1", line: 1, first: 1, last: 3, words: 3, text: "Rui Costa Lima", category: "Pessoa", role: "titular", reason: "Nome do titular", source: "modelo", kept: false },
    { id: "L2-1", line: 2, first: 1, last: 4, words: 4, text: "916 222 333, rui@mail.pt", category: "Contacto", role: "", reason: "Padrão de identificador", source: "rede de segurança", kept: false },
    { id: "L3-2", line: 3, first: 2, last: 3, words: 2, text: "Paulo Reis", category: "Pessoa", role: "profissional", reason: "Nome do médico", source: "modelo", kept: false },
  ],
  summary: { items: 3, masked_words: 9, by_category: { Pessoa: 2, Contacto: 1 } },
  leaks: { checked: 2, leaks: [] },
};

describe("spanText", () => {
  it("returns the slice of the line with its own spacing", () => {
    expect(spanText("Nome:  Rui Costa Lima", 1, 3)).toBe("Rui Costa Lima");
    expect(spanText("a  b   c", 0, 1)).toBe("a  b");
    expect(spanText("a b", 0, 5)).toBe("");
  });
});

describe("fromState", () => {
  it("turns backend items into entities the review can find in the text", () => {
    const r = fromState(state);
    expect(r.docId).toBe("abc123");
    expect(r.text).toBe(state.lines.join("\n"));
    expect(r.entities.map((e) => e.text)).toEqual(["Rui Costa Lima", "916 222 333, rui@mail.pt", "Paulo Reis"]);
    for (const e of r.entities) expect(r.text).toContain(e.text);
    expect(r.entities[2]).toMatchObject({ category: "Pessoa", role: "profissional", refs: ["L3-2"] });
    expect(r.entities[1]).not.toHaveProperty("role");
  });

  it("merges repeated values and keeps every backend id", () => {
    const twice: DocumentState = {
      ...state,
      lines: [...state.lines, "Assina: Paulo Reis"],
      items: [...state.items, { ...state.items[2]!, id: "L4-1", line: 4, first: 1, last: 2 }],
    };
    const r = fromState(twice);
    expect(r.entities).toHaveLength(3);
    expect(r.entities[2]?.refs).toEqual(["L3-2", "L4-1"]);
  });

  it("summarises the counts, the safety net and the leak check", () => {
    const s = fromState(state).summary;
    expect(s).toContain("9 palavras em 3 dados");
    expect(s).toContain("1 foram apanhados pela rede de segurança");
    expect(s).toContain("0 fugas em 2 valores");
    const leaky = { ...state, leaks: { checked: 2, leaks: [{ line: 2, text: "rui@mail.pt" }] } };
    expect(fromState(leaky).summary).toContain("1 de 2 valores continuam legíveis");
  });
});
