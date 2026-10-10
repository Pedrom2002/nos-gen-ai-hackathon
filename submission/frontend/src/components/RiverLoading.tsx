import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";

export function RiverLoading({ text }: { text: string }) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const [message, setMessage] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch { return; }
    const status = window.setInterval(() => setMessage((n) => (n + 1) % 4), 1500);
    const words = Array.from(card.current?.querySelectorAll<HTMLElement>("[data-river-word]") ?? []);
    let frame = 0;
    let start: number | undefined;
    let last = 0;
    const animate = (time: number) => {
      start ??= time;
      const position = ((time - start) % 2800) / 2800 * 125 - 25;
      if (band.current) band.current.style.left = `${position}%`;
      if (time - last > 45 && card.current) {
        last = time;
        const bounds = card.current.getBoundingClientRect();
        const left = bounds.left + bounds.width * position / 100;
        const right = left + bounds.width * .25;
        for (const word of words) {
          const rect = word.getBoundingClientRect();
          const middle = (rect.left + rect.right) / 2;
          word.dataset["washed"] = String(middle > left && middle < right);
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { clearInterval(status); cancelAnimationFrame(frame); };
  }, [text]);
  return (
    <section className="mx-auto w-full max-w-3xl animate-fade-up py-3" aria-busy="true" aria-label={t.analyzing}>
      <h2 className="mb-7 text-center text-xl font-semibold">{t.analyzing.replace(/[…\.]+$/, "")}<span className="river-ellipsis text-primary" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></h2>
      <div ref={card} className="river-loading relative isolate overflow-hidden rounded-lg border bg-card p-5 sm:p-8">
        <div aria-hidden="true" className="relative min-h-56 select-none whitespace-pre-wrap break-words font-mono text-xs leading-7 text-muted-foreground [overflow-wrap:anywhere] sm:text-sm">
          {text.split(/\r?\n/).slice(0, 8).map((line, i) => <div key={i} className="min-h-7">{line.split(/(\s+)/).map((part, j) => part.trim() ? <span key={j} data-river-word data-washed="false" className="river-loading-word"><span>{part}</span><span className="river-redaction" /></span> : part)}</div>)}
        </div>
        <div ref={band} className="river-sweep pointer-events-none absolute inset-y-0 text-primary" aria-hidden="true">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 140 400" preserveAspectRatio="none">
            <path className="river-loading-glow river-band" d="M20 -30 Q-5 70 20 150 T20 330 L20 430 H125 V-30Z" fill="currentColor" />
            <path className="river-band" d="M25 -30 Q-5 70 25 150 T25 330 L25 430 H105 Q140 330 110 230 T110 30 V-30Z" fill="currentColor" opacity=".18" />
            <path className="river-band river-band-two" d="M45 -30 Q10 60 45 160 T45 350 L45 430 H120 Q90 320 115 210 T110 -30Z" fill="currentColor" opacity=".22" />
            <path className="river-band river-band-three" d="M65 -30 Q95 70 65 160 T65 350 L65 430 H100 Q125 320 95 210 T100 -30Z" fill="currentColor" opacity=".25" />
          </svg>
          <span className="river-particle top-[15%] text-sm">*</span><span className="river-particle text-xs">*</span><span className="river-particle text-base">*</span>
        </div>
      </div>
      <div aria-hidden="true" className="mt-3 h-0.5 overflow-hidden rounded-full bg-primary/10"><div className="h-full w-1/3 animate-progress bg-primary" /></div>
      <p className="mt-5 min-h-10 text-center text-sm text-muted-foreground" role="status" aria-live="polite"><span key={`${s.lang}-${message}`} className="river-status inline-block">{u.loadingMessages[message]}</span></p>
    </section>
  );
}
