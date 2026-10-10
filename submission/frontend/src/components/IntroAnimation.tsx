import { useEffect, useState } from "react";
import { LOGO_STARS, LOGO_WAVE } from "./LetheLogo";
import { readStorage, writeStorage } from "@/lib/safe-storage";

const KEY = "lethe.intro.seen";

// Read once when the module loads. A remount of the component (a hot reload, a re-render
// of the page) must not count as "already seen" and hide an animation the user is watching.
const alreadySeen = readStorage(KEY, "session") === "1";

// Opening animation: the river draws in from the left, flows right and shatters into the logo's asterisks.
export function IntroAnimation() {
  const [phase, setPhase] = useState<"hidden" | "play" | "out">("play");

  useEffect(() => {
    let reduced = false;
    try {
      reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    if (reduced || alreadySeen) { setPhase("hidden"); return; }
    writeStorage(KEY, "1", "session");
    const a = setTimeout(() => setPhase("out"), 2600);
    const b = setTimeout(() => setPhase("hidden"), 3300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (phase === "hidden") return null;
  return (
    <div
      aria-hidden="true"
      onClick={() => setPhase("hidden")}
      className={`lethe-intro fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background ${phase === "out" ? "lethe-intro-out" : ""}`}
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-28 w-28 overflow-visible text-primary sm:h-36 sm:w-36">
        <path d={LOGO_WAVE} pathLength={1} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="lethe-intro-wave" />
        <g fill="currentColor" fontFamily="Arial" fontWeight="700" textAnchor="middle">
          {LOGO_STARS.map((st, i) => (
            <text
              key={i} x={st.x} y={st.y} fontSize={st.s}
              className="lethe-intro-star"
              style={{ ["--o" as string]: st.o, ["--dx" as string]: `${-4 - i * 0.6}px`, ["--dy" as string]: `${i % 2 ? 2 : -2}px`, animationDelay: `${1050 + i * 140}ms` }}
            >*</text>
          ))}
        </g>
      </svg>
      <span className="lethe-intro-name text-2xl font-semibold tracking-[0.3em] text-foreground">LETHE</span>
    </div>
  );
}
