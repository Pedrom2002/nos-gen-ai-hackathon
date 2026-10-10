import { useEffect, useState } from "react";
import { LetheWordmark } from "./LetheLogo";
import { readStorage, writeStorage } from "@/lib/safe-storage";

const KEY = "lethe.intro.seen";

// Read once when the module loads. A remount of the component (a hot reload, a re-render
// of the page) must not count as "already seen" and hide an animation the user is watching.
const alreadySeen = readStorage(KEY, "session") === "1";

// Opening animation: the wordmark is washed in from the left, like ink carried by a river.
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
      className={`lethe-intro fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background ${phase === "out" ? "lethe-intro-out" : ""}`}
    >
      <LetheWordmark className="lethe-intro-logo h-32 sm:h-44" />
    </div>
  );
}
