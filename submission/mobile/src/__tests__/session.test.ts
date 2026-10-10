import { entitiesFrom, keepIds } from "@/session";

const result = {
  docId: "d",
  text: "Nome: Rui Costa\nRui Costa",
  summary: "",
  entities: [
    { text: "Rui Costa", category: "Pessoa", reason: "Nome", refs: ["L1-1", "L2-0"],
      at: [{ line: 1, first: 1, last: 2 }, { line: 2, first: 0, last: 1 }] },
    { text: "nada", category: "Pessoa", reason: "" },
    { text: "Rui Costa", category: "Pessoa", reason: "duplicado" },
  ],
};

test("maps API entities like the web does", () => {
  const ents = entitiesFrom(result);
  expect(ents).toHaveLength(1); // "nada" is not in the text, the duplicate is dropped
  expect(ents[0]).toMatchObject({ text: "Rui Costa", category: "nome", enabled: true, refs: ["L1-1", "L2-0"] });
  expect(ents[0]?.gdpr_basis).toBe("Art. 4.º(1) RGPD");
});

test("keeps visible the refs of disabled entities only", () => {
  const ents = entitiesFrom(result);
  expect(keepIds(ents)).toEqual([]);
  expect(keepIds(ents.map((e) => ({ ...e, enabled: false })))).toEqual(["L1-1", "L2-0"]);
});
