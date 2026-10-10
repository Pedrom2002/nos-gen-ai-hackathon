import { useMemo, type ReactNode } from "react";
import { findSpans, type Entity } from "@/lib/anonymizer";

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
