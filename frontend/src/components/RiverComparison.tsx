import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import { findSpans, type Entity } from "@/lib/anonymizer";

// Display only: preserve each source token's width and blank lines. Official
// output still comes exclusively from anonymize() in the page.
export function RiverComparison({ text, entities, output }: { text: string; entities: Entity[]; output: string }) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const [position, setPosition] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const dragging = useRef(false);
  const cancelReveal = () => cancelAnimationFrame(frame.current);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPosition(50); return; }
    let started: number | undefined;
    const animate = (now: number) => {
      started ??= now;
      const progress = Math.min((now - started) / 1800, 1);
      setPosition((1 - Math.cos(progress * Math.PI)) * 50);
      if (progress < 1) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame.current);
  }, []);
  const content = useRef<HTMLDivElement>(null);
  const maskLayer = useRef<HTMLDivElement>(null);
  const foamBack = useRef<SVGPathElement>(null);
  const foamMid = useRef<SVGPathElement>(null);
  const foamLine = useRef<SVGPathElement>(null);
  const posRef = useRef(position);
  posRef.current = position;
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = (now: number) => {
      const el = content.current;
      if (el) {
        const w = el.clientWidth, h = el.clientHeight, t = still ? 0 : now / 1000;
        const base = posRef.current / 100 * w;
        const edge = (y: number, phase = 0) => base + Math.sin(y / 46 + t * 2.2 + phase) * 9 + Math.sin(y / 17 - t * 3.1 + phase) * 3.5;
        const pts: string[] = []; const line: string[] = []; const mid: string[] = []; const back: string[] = [];
        for (let y = 0; y <= h + 8; y += 8) {
          const x = Math.max(0, edge(y));
          pts.push(`${x}px ${y}px`);
          line.push(`${line.length ? "L" : "M"}${x} ${y}`);
          mid.push(`${mid.length ? "L" : "M"}${Math.max(0, edge(y, 0.6) - 5)} ${y}`);
          back.push(`${back.length ? "L" : "M"}${Math.max(0, edge(y, 1.3) - 9)} ${y}`);
        }
        if (maskLayer.current) maskLayer.current.style.clipPath = base <= 0 ? "inset(0 100% 0 0)" : `polygon(0 0, ${pts.join(", ")}, 0 ${h + 8}px)`;
        const vis = base > 0 && base < w ? "1" : "0";
        foamLine.current?.setAttribute("d", line.join(" ")); foamLine.current?.setAttribute("opacity", vis);
        foamMid.current?.setAttribute("d", mid.join(" ")); foamMid.current?.setAttribute("opacity", vis);
        foamBack.current?.setAttribute("d", back.join(" ")); foamBack.current?.setAttribute("opacity", vis);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  const masked = useMemo(() => {
    const parts: ReactNode[] = [];
    let cursor = 0;
    findSpans(text, entities.filter((e) => e.enabled)).forEach((span, i) => {
      parts.push(text.slice(cursor, span.start));
      text.slice(span.start, span.end).split(/(\s+)/).forEach((token, j) => {
        parts.push(!token.trim() ? token : <span key={`${i}-${j}`} className="river-masked-word"><span className="invisible">{token}</span><span className="absolute left-0 top-0 text-primary">*</span></span>);
      });
      cursor = span.end;
    });
    parts.push(text.slice(cursor));
    return parts;
  }, [text, entities]);
  const move = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setPosition(Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)));
  };
  return (
    <div>
      <div className="sr-only"><h2>{t.anonymized}</h2><pre>{output}</pre><h2>{t.original}</h2><pre>{text}</pre></div>
      <div className="mb-3 flex justify-between gap-3 text-xs font-medium text-muted-foreground"><span>{t.anonymized}</span><span>{t.original}</span></div>
      <div ref={box} dir="ltr" className="relative overflow-hidden rounded-lg border bg-card" role="region" aria-label={u.comparison}>
        <div tabIndex={0} className="max-h-[60dvh] overflow-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={u.comparison}>
          <div ref={content} className="relative">
            <pre aria-hidden="true" className="river-document p-4 sm:p-5">{text}</pre>
            <div ref={maskLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-card"><pre className="river-document p-4 sm:p-5">{masked}</pre></div>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary">
              <path ref={foamBack} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="14" strokeLinecap="round" />
              <path ref={foamMid} fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="5" />
              <path ref={foamLine} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        </div>
        <Button variant="outline" size="icon" role="slider" aria-label={u.riverDivider} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position)} aria-valuetext={`${Math.round(position)}%`} aria-orientation="horizontal" title={u.riverDivider} className="river-handle absolute top-1/2 z-10 size-11 -translate-y-1/2 touch-none rounded-full border-primary bg-card text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" style={{ left: `clamp(0px, calc(${position}% - 22px), calc(100% - 44px))` }} onPointerDown={(e) => {
          cancelReveal(); dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId);
        }} onPointerMove={(e) => { if (dragging.current) move(e.clientX); }} onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { dragging.current = false; }} onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault(); cancelReveal();
          setPosition((p) => e.key === "Home" ? 0 : e.key === "End" ? 100 : Math.max(0, Math.min(100, p + (e.key === "ArrowRight" ? 5 : -5))));
        }}><ArrowLeftRight className="size-5" aria-hidden="true" /></Button>
      </div>
    </div>
  );
}