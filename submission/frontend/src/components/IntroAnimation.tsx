import { useEffect, useRef, useState } from "react";
import { LetheWordmark } from "./LetheLogo";
import { readStorage, writeStorage } from "@/lib/safe-storage";

const KEY = "lethe.intro.seen";

// Read once when the module loads. A remount of the component (a hot reload, a re-render
// of the page) must not count as "already seen" and hide an animation the user is watching.
const alreadySeen = readStorage(KEY, "session") === "1";

// Opening animation: the wordmark is washed in from the left, like ink carried by a river.
export function IntroAnimation() {
  const [phase, setPhase] = useState<"hidden" | "play" | "out">("play");
  const logoRef = useRef<SVGSVGElement>(null);

  // Slide and shrink the big wordmark onto the header logo it is about to become.
  const flyToHeader = () => {
    const logo = logoRef.current;
    const target = document.getElementById("lethe-header-logo");
    if (!logo || !target) return;
    const from = logo.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const scale = to.width / from.width;
    logo.style.transformOrigin = "0 0";
    logo.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
  };

  useEffect(() => {
    let reduced = false;
    try {
      reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    if (reduced || alreadySeen) { setPhase("hidden"); return; }
    document.documentElement.setAttribute("data-intro", "playing");
    writeStorage(KEY, "1", "session");
    const a = setTimeout(() => { flyToHeader(); setPhase("out"); }, 1850);
    const b = setTimeout(() => setPhase("hidden"), 2950);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  // The header logo stays hidden until the intro wordmark has landed on it.
  useEffect(() => {
    if (phase === "hidden") document.documentElement.removeAttribute("data-intro");
  }, [phase]);

  if (phase === "hidden") return null;
  return (
    <div
      aria-hidden="true"
      onClick={() => setPhase("hidden")}
      className={`lethe-intro fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background ${phase === "out" ? "lethe-intro-out" : ""}`}
    >
      <LetheWordmark ref={logoRef} className="lethe-intro-logo h-32 sm:h-44" />
    </div>
  );
}
