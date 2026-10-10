import { createContext, useContext, useEffect, useState, type Context, type ReactNode } from "react";
import { DICTS, LANGS, type Dict, type Lang } from "./i18n";
import { readStorage, removeStorage, writeStorage } from "./safe-storage";

// The interface keeps one accent colour: blue, in its light and dark variants.
export const ACCENT = { light: "oklch(0.58 0.17 255)", dark: "oklch(0.72 0.15 255)" };

export interface Settings {
  theme: "light" | "dark" | "system";
  lang: Lang;
}

export const DEFAULTS: Settings = {
  theme: "light", lang: "pt",
};

const KEY = "anonimizador.settings";

interface Ctx { s: Settings; set: (p: Partial<Settings>) => void; reset: () => void; t: Dict; isDark: boolean }

// The context object has to survive hot reloads. When Vite re-evaluates this file
// while the app is mounted, a fresh createContext() would leave the already-mounted
// provider writing to a different context than the one components read from, so
// every useSettings() call would see null. Keeping one instance on globalThis
// means provider and consumers always share the same object.
const CTX_KEY = "__anonimizador.settings.ctx";
const store = globalThis as Record<string, unknown>;
const SettingsCtx: Context<Ctx | null> =
  (store[CTX_KEY] as Context<Ctx | null> | undefined) ?? createContext<Ctx | null>(null);
store[CTX_KEY] = SettingsCtx;

function loadStored(): Settings {
  try {
    const raw = readStorage(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const s: Settings = { theme: saved.theme ?? DEFAULTS.theme, lang: saved.lang && saved.lang in DICTS ? saved.lang : DEFAULTS.lang };
    // Write back only the fields we still use, so old entries (a personal profile,
    // an accent choice) leave browser storage instead of lingering in it.
    writeStorage(KEY, JSON.stringify(s));
    return s;
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [sysDark, setSysDark] = useState(false);

  useEffect(() => {
    setS(loadStored());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const isDark = s.theme === "dark" || (s.theme === "system" && sysDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    const c = isDark ? ACCENT.dark : ACCENT.light;
    root.style.setProperty("--primary", c);
    root.style.setProperty("--ring", c);
    root.lang = s.lang;
    root.dir = LANGS.find((l) => l.id === s.lang)?.rtl ? "rtl" : "ltr";
  }, [s, isDark]);

  const set = (p: Partial<Settings>) => setS((prev) => {
    const next = { ...prev, ...p };
    writeStorage(KEY, JSON.stringify(next));
    return next;
  });
  const reset = () => { removeStorage(KEY); setS(DEFAULTS); };

  return <SettingsCtx.Provider value={{ s, set, reset, t: DICTS[s.lang], isDark }}>{children}</SettingsCtx.Provider>;
}

// Without a provider (a stale hot-reload, a component rendered outside the page),
// fall back to the saved settings instead of throwing, so the screen never blanks.
const NOOP = () => {};
let offline: Ctx | null = null;

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (c) return c;
  if (!offline) {
    const s = loadStored();
    offline = { s, set: NOOP, reset: NOOP, t: DICTS[s.lang] ?? DICTS.pt, isDark: s.theme === "dark" };
  }
  return offline;
}
