// Review helpers, on the web's shared masking: what to draw as marks, how many
// values each category has, and the changes a reviewer makes.
import { CATEGORIES, findSpans, type CategoryId, type Entity } from "@web/lib/anonymizer";

/** A piece of a line: plain text, or a value the reviewer can mask or keep. */
export type Segment = { text: string; entity?: Entity };

/** The text split in lines of segments. Marks come from the shared findSpans
 * (backend positions first, whole words otherwise), for every entity, kept
 * ones too, so the reviewer can mask them again. */
export function lineSegments(text: string, entities: Entity[]): Segment[][] {
  const spans = findSpans(text, entities);
  const lines: Segment[][] = [[]];
  const push = (piece: string, entity?: Entity) => {
    piece.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push(entity ? { text: part, entity } : { text: part });
    });
  };
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) push(text.slice(cursor, span.start));
    push(text.slice(span.start, span.end), span.entity);
    cursor = span.end;
  }
  if (cursor < text.length) push(text.slice(cursor));
  return lines;
}

export function categoryCounts(entities: Entity[]): { id: CategoryId; total: number; enabled: number }[] {
  return CATEGORIES.map((c) => ({
    id: c.id,
    total: entities.filter((e) => e.category === c.id).length,
    enabled: entities.filter((e) => e.category === c.id && e.enabled).length,
  })).filter((c) => c.total > 0);
}

export function toggle(entities: Entity[], id: string): Entity[] {
  return entities.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
}

export function setCategory(entities: Entity[], category: CategoryId, on: boolean): Entity[] {
  return entities.map((e) => (e.category === category ? { ...e, enabled: on } : e));
}

const SPECIAL: CategoryId[] = ["saude", "biometrico", "religiao_etnia"];

/** Adds a word the reviewer marked by hand (punctuation around it dropped).
 * null when there is no real word or the value is already there. */
export function addManual(entities: Entity[], word: string, category: CategoryId, reason: string): Entity[] | null {
  const value = word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!value || entities.some((e) => e.text === value)) return null;
  return [...entities, {
    id: `m-${Date.now()}-${entities.length}`, text: value, category, enabled: true, manual: true, reason,
    gdpr_basis: SPECIAL.includes(category) ? "Art. 9.º(1) RGPD" : "Art. 4.º(1) RGPD",
  }];
}
