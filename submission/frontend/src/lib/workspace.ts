// What the page holds while several documents are open at once. Pure types.
import { normalizeCategory, type Entity } from "./anonymizer";
import type { AnalysisResult } from "./api-model";
import type { SourceDoc } from "./document";
import type { ReadProgress } from "./source";

/** A file picked or dropped, before the analysis: read in this browser, or being read. */
export interface Draft {
  key: string;
  name: string;
  /** Null while the file is still being read. */
  source: SourceDoc | null;
  /** The text as read here; with a single draft it is editable. */
  text: string;
  busy: ReadProgress | null;
}

/** A document the backend has analysed: one tab, one review, one result. */
export interface OpenDoc {
  key: string;
  name: string;
  /** Null for pasted text. */
  source: SourceDoc | null;
  result: AnalysisResult;
}

/** Where a document's tab stands, so the shell can draw the stepper and offer the zip. */
export interface DocStatus { step: 1 | 2; finishing: boolean }

/** A file the batch refused, with the backend's reason. */
export interface FailedFile { name: string; error: string }

let counter = 0;
export function draftKey(): string { return `d${Date.now().toString(36)}-${++counter}`; }

/** The backend's entities as the review lists them: one per distinct value found in the text. */
export function entitiesFrom(r: AnalysisResult): Entity[] {
  const seen = new Set<string>();
  const ents: Entity[] = [];
  r.entities.forEach((e, i) => {
    const t = e.text?.trim();
    if (!t || !r.text.includes(t) || seen.has(t)) return;
    seen.add(t);
    ents.push({ id: `ai-${i}`, text: t, category: normalizeCategory(e.category), reason: e.reason ?? "", gdpr_basis: e.gdpr_basis ?? "Art. 4.º(1) RGPD", enabled: true, role: e.role, refs: e.refs, at: e.at });
  });
  return ents;
}

/** Every document has its result generated, applied by the backend, and a backend id for the zip. */
export function allFinished(docs: OpenDoc[], status: Record<string, DocStatus>): boolean {
  return docs.length > 0 && docs.every((d) => !!d.result.docId && status[d.key]?.step === 2 && !status[d.key]?.finishing);
}
