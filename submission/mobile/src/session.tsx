// The document being worked on: what was imported, what the API found, and
// the review (with undo/redo from the web's shared review history).
import { createContext, useContext, useMemo, useReducer, useState, type ReactNode } from "react";

import { anonymize, normalizeCategory, type Entity } from "@web/lib/anonymizer";
import type { AnalysisResult } from "@web/lib/api-model";
import { emptyHistory, reviewHistory, type ReviewAction, type ReviewHistory } from "@web/lib/review-history";

import type { PickedFile } from "@/api";

export type SourceKind = "image" | "pdf" | "docx" | "text";
export interface Source {
  /** The file itself, sent as is; absent for pasted text. */
  file?: PickedFile;
  text: string;
  kind: SourceKind;
}

/** API entities as review entities, exactly as the web does it: one per value
 * present in the text, with the backend ids and positions it covers. */
export function entitiesFrom(r: AnalysisResult): Entity[] {
  const seen = new Set<string>();
  const entities: Entity[] = [];
  r.entities.forEach((e, i) => {
    const text = e.text?.trim();
    if (!text || !r.text.includes(text) || seen.has(text)) return;
    seen.add(text);
    entities.push({
      id: `ai-${i}`, text, category: normalizeCategory(e.category), reason: e.reason ?? "",
      gdpr_basis: e.gdpr_basis ?? "Art. 4.º(1) RGPD", enabled: true, role: e.role, refs: e.refs, at: e.at,
    });
  });
  return entities;
}

/** Backend item ids the reviewer chose to keep visible. */
export function keepIds(entities: Entity[]): string[] {
  return entities.filter((e) => !e.enabled).flatMap((e) => e.refs ?? []);
}

interface SessionValue {
  source: Source | null;
  setSource: (s: Source | null) => void;
  result: AnalysisResult | null;
  /** Stores the API answer and starts a new review from it. */
  setResult: (r: AnalysisResult | null) => void;
  history: ReviewHistory;
  dispatch: (a: ReviewAction) => void;
  /** The anonymised text for the current review. */
  output: string;
  reset: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<Source | null>(null);
  const [result, setResultState] = useState<AnalysisResult | null>(null);
  const [history, dispatch] = useReducer(reviewHistory, emptyHistory);

  const value = useMemo<SessionValue>(() => ({
    source,
    setSource,
    result,
    setResult: (r) => {
      setResultState(r);
      dispatch({ type: "reset", entities: r ? entitiesFrom(r) : [] });
    },
    history,
    dispatch,
    output: result ? anonymize(result.text, history.present) : "",
    reset: () => {
      setSource(null);
      setResultState(null);
      dispatch({ type: "reset", entities: [] });
    },
  }), [source, result, history]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
