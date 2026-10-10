import { describe, expect, it } from "vitest";
import { emptyHistory, reviewHistory } from "@/lib/review-history";
import type { Entity } from "@/lib/anonymizer";

const entity: Entity = { id: "one", text: "Maria", category: "nome", enabled: true, reason: "", gdpr_basis: "" };
describe("Review undo and redo", () => {
  it("undoes and redoes an entity toggle", () => {
    const start = reviewHistory(emptyHistory, { type: "reset", entities: [entity] });
    const changed = reviewHistory(start, { type: "commit", entities: [{ ...entity, enabled: false }] });
    const undone = reviewHistory(changed, { type: "undo" });
    expect(undone.present[0]?.enabled).toBe(true);
    expect(reviewHistory(undone, { type: "redo" }).present[0]?.enabled).toBe(false);
  });
  it("undoes a whole category change as one action", () => {
    const entries = [entity, { ...entity, id: "two", text: "João" }];
    const start = reviewHistory(emptyHistory, { type: "reset", entities: entries });
    const changed = reviewHistory(start, { type: "commit", entities: entries.map((e) => ({ ...e, enabled: false })) });
    expect(reviewHistory(changed, { type: "undo" }).present.map((e) => e.enabled)).toEqual([true, true]);
  });
  it("undoes and redoes a manual addition", () => {
    const added = reviewHistory(emptyHistory, { type: "commit", entities: [{ ...entity, manual: true }] });
    const undone = reviewHistory(added, { type: "undo" });
    expect(undone.present).toHaveLength(0);
    expect(reviewHistory(undone, { type: "redo" }).present[0]?.manual).toBe(true);
  });
  it("clears redo after a new review edit", () => {
    const changed = reviewHistory(emptyHistory, { type: "commit", entities: [entity] });
    const undone = reviewHistory(changed, { type: "undo" });
    const edited = reviewHistory(undone, { type: "commit", entities: [{ ...entity, id: "new" }] });
    expect(edited.future).toHaveLength(0);
    expect(reviewHistory(edited, { type: "redo" }).present[0]?.id).toBe("new");
  });
  it("starts a new document with no previous history", () => {
    const changed = reviewHistory(emptyHistory, { type: "commit", entities: [entity] });
    const reset = reviewHistory(changed, { type: "reset", entities: [] });
    expect(reset.past).toHaveLength(0);
    expect(reset.future).toHaveLength(0);
    expect(reviewHistory(reset, { type: "undo" }).present).toHaveLength(0);
  });
});