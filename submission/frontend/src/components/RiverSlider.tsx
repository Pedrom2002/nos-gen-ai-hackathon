import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";

interface Props {
  /** The anonymized layer, revealed from the left behind the wavy edge. */
  after: ReactNode;
  /** The original layer underneath; both layers must have the same size. */
  before: ReactNode;
  /** [after, before] captions above the box. */
  labels: [string, string];
  ariaLabel: string;
  /** Screen-reader alternative for the visual comparison. */
  sr?: ReactNode;
  /** Whenever this changes, the divider jumps back to the start to show the original. */
  resetKey?: string;
}

// The river divider: a draggable wavy edge between two stacked layers. It
// knows nothing about what the layers contain, so text and page images share it.
export function RiverSlider({ after, before, labels, ariaLabel, sr, resetKey = "" }: Props) {
  const { s } = useSettings();
  const u = UI[s.lang];
  const [position, setPosition] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);
  const dragging = useRef(false);
  const cancelReveal = () => cancelAnimationFrame(frame.current);
  useEffect(() => { if (resetKey) { cancelReveal(); setPosition(0); } }, [resetKey]);
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
  const move = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setPosition(Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100)));
  };
  return (
    <div>
      {sr && <div className="sr-only">{sr}</div>}
      <div className="mb-3 flex justify-between gap-3 text-xs font-medium text-muted-foreground"><span>{labels[0]}</span><span>{labels[1]}</span></div>
      <div ref={box} dir="ltr" className="relative overflow-hidden rounded-lg border bg-card" role="region" aria-label={ariaLabel}>
        <div tabIndex={0} className="max-h-[60dvh] overflow-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={ariaLabel}>
          <div ref={content} className="relative">
            <div aria-hidden="true">{before}</div>
            <div ref={maskLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 bg-card">{after}</div>
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
