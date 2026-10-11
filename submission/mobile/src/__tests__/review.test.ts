import type { Entity } from "@web/lib/anonymizer";
import { emptyHistory, reviewHistory } from "@web/lib/review-history";

import { addManual, categoryCounts, lineSegments, setCategory, toggle } from "@/review";

const entity = (id: string, text: string, category: Entity["category"], enabled = true): Entity =>
  ({ id, text, category, reason: "", gdpr_basis: "", enabled });

test("marks every whole occurrence, never inside another word", () => {
  const lines = lineSegments("Nome: Ana\nAna e Anabela", [entity("a", "Ana", "nome")]);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toEqual([{ text: "Nome: " }, { text: "Ana", entity: expect.objectContaining({ id: "a" }) }]);
  expect(lines[1]?.filter((s) => s.entity).map((s) => s.text)).toEqual(["Ana"]);
  expect(lines[1]?.map((s) => s.text).join("")).toBe("Ana e Anabela");
});

test("kept values are still marked, so they can be masked again", () => {
  const [line] = lineSegments("NIF 123456789", [entity("n", "123456789", "identificador", false)]);
  expect(line?.[1]?.entity?.enabled).toBe(false);
});

test("counts per category, in the web's category order", () => {
  const ents = [entity("1", "Rui", "nome"), entity("2", "912", "contacto", false), entity("3", "Ana", "nome")];
  expect(categoryCounts(ents)).toEqual([
    { id: "nome", total: 2, enabled: 2 },
    { id: "contacto", total: 1, enabled: 0 },
  ]);
});

test("one undo restores a whole category toggle", () => {
  const ents = [entity("1", "Rui", "nome"), entity("2", "Ana", "nome"), entity("3", "912", "contacto")];
  let h = reviewHistory(emptyHistory, { type: "reset", entities: ents });
  h = reviewHistory(h, { type: "commit", entities: setCategory(h.present, "nome", false) });
  expect(h.present.filter((e) => e.category === "nome").every((e) => !e.enabled)).toBe(true);
  h = reviewHistory(h, { type: "undo" });
  expect(h.present.every((e) => e.enabled)).toBe(true);
  expect(toggle(h.present, "3").find((e) => e.id === "3")?.enabled).toBe(false);
});

test("manual marks: whole words with a letter or digit, never duplicates", () => {
  const ents = [entity("1", "Rui", "nome")];
  expect(addManual(ents, "", "nome", "manual")).toBeNull();
  expect(addManual(ents, "—", "nome", "manual")).toBeNull();
  expect(addManual(ents, "(", "outro", "manual")).toBeNull();
  expect(addManual(ents, "Rui", "nome", "manual")).toBeNull();
  const added = addManual(ents, "Costa,", "nome", "manual");
  expect(added?.at(-1)).toMatchObject({ text: "Costa", category: "nome", manual: true, enabled: true, reason: "manual" });
});
