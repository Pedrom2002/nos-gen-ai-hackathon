import { useMemo, type ReactNode } from "react";
import { anonymizeRuns, findSpans, type Entity } from "@/lib/anonymizer";

// The original text with every occurrence of the focused entity highlighted.
export function FocusedText({ text, entities, focusId }: { text: string; entities: Entity[]; focusId: string }) {
  const nodes = useMemo(() => {
    if (!focusId) return text;
    const parts: ReactNode[] = [];
    let cursor = 0;
    findSpans(text, entities.filter((e) => e.enabled)).forEach((span, i) => {
      if (span.entity.id !== focusId) return;
      parts.push(text.slice(cursor, span.start));
      parts.push(<mark key={i} data-focus-mark className="focus-mark">{text.slice(span.start, span.end)}</mark>);
      cursor = span.end;
    });
    parts.push(text.slice(cursor));
    return parts;
  }, [text, entities, focusId]);
  return <>{nodes}</>;
}

// The anonymized text with the focused entity's "*" highlighted, so a click in
// the report points at the same entity on both sides of the comparison.
export function FocusedMasked({ text, entities, focusId }: { text: string; entities: Entity[]; focusId: string }) {
  const runs = useMemo(() => anonymizeRuns(text, entities), [text, entities]);
  let stars = 0;
  return <>{runs.map((run, i) => {
    if (!run.entityId) return <span key={i}>{run.text}</span>;
    const masks = run.text.split("*").map((part, k, arr) => (
      <span key={k}>{part}{k < arr.length - 1 && <span className="lethe-wash text-primary" style={{ animationDelay: `${Math.min(stars++ * 40, 1600)}ms` }}>*</span>}</span>
    ));
    return run.entityId === focusId
      ? <mark key={i} data-focus-mark className="focus-mark">{masks}</mark>
      : <span key={i}>{masks}</span>;
  })}</>;
}
