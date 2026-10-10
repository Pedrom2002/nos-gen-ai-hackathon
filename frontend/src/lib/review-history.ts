import type { Entity } from "./anonymizer";

export interface ReviewHistory { past: Entity[][]; present: Entity[]; future: Entity[][] }
export type ReviewAction = { type: "reset" | "commit"; entities: Entity[] } | { type: "undo" | "redo" };
export const emptyHistory: ReviewHistory = { past: [], present: [], future: [] };
export function reviewHistory(state: ReviewHistory, action: ReviewAction): ReviewHistory {
  if (action.type === "reset") return { past: [], present: action.entities, future: [] };
  if (action.type === "commit") {
    if (JSON.stringify(action.entities) === JSON.stringify(state.present)) return state;
    return { past: [...state.past, state.present], present: action.entities, future: [] };
  }
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
  }
  const next = state.future[0];
  return next ? { past: [...state.past, state.present], present: next, future: state.future.slice(1) } : state;
}