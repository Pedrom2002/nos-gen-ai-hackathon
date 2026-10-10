import { useMemo, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import { findSpans, type Entity } from "@/lib/anonymizer";
import { FocusedText } from "@/components/FocusedText";
import { RiverSlider } from "@/components/RiverSlider";

// Display only: preserve each source token's width and blank lines. Official
// output still comes exclusively from anonymize() in the page.
export function RiverComparison({ text, entities, output, focusId = "" }: { text: string; entities: Entity[]; output: string; focusId?: string }) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const masked = useMemo(() => {
    const parts: ReactNode[] = [];
    let cursor = 0;
    findSpans(text, entities.filter((e) => e.enabled)).forEach((span, i) => {
      parts.push(text.slice(cursor, span.start));
      text.slice(span.start, span.end).split(/(\s+)/).forEach((token, j) => {
        parts.push(!token.trim() ? token : <span key={`${i}-${j}`} className="river-masked-word"><span className="invisible">{token}</span><span className="absolute left-0 -top-[0.25em] leading-none text-primary">*</span></span>);
      });
      cursor = span.end;
    });
    parts.push(text.slice(cursor));
    return parts;
  }, [text, entities]);
  return (
    <RiverSlider
      labels={[t.anonymized, t.original]}
      ariaLabel={u.comparison}
      resetKey={focusId}
      sr={<><h2>{t.anonymized}</h2><pre>{output}</pre><h2>{t.original}</h2><pre>{text}</pre></>}
      before={<pre className="river-document p-4 sm:p-5"><FocusedText text={text} entities={entities} focusId={focusId} /></pre>}
      after={<pre className="river-document p-4 sm:p-5">{masked}</pre>}
    />
  );
}
