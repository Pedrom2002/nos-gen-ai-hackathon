// Theme, language and API address, kept on the phone between sessions.
// The texts come from the web frontend's dictionaries (same 8 languages).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DICTS, type Dict, type Lang } from "@web/lib/i18n";
import { EXTRA } from "@web/lib/i18n-extra";
import { UI, type UIStrings } from "@web/lib/i18n-ui";

export type Theme = "light" | "dark" | "system";
export interface Settings {
  theme: Theme;
  lang: Lang;
  /** Base address of the Lethe API (for example the tunnel); empty = demo mode. */
  apiUrl: string;
}

export const DEFAULTS: Settings = { theme: "dark", lang: "pt", apiUrl: "" };
const KEY = "lethe.settings";
const THEMES: Theme[] = ["light", "dark", "system"];

/** Stored settings, or the defaults for anything missing or invalid. */
export function parseSettings(raw: string | null): Settings {
  let saved: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") saved = parsed as typeof saved;
  } catch {
    return DEFAULTS;
  }
  return {
    theme: THEMES.includes(saved.theme as Theme) ? (saved.theme as Theme) : DEFAULTS.theme,
    lang: typeof saved.lang === "string" && saved.lang in DICTS ? (saved.lang as Lang) : DEFAULTS.lang,
    apiUrl: typeof saved.apiUrl === "string" ? saved.apiUrl : DEFAULTS.apiUrl,
  };
}

type Extra = (typeof EXTRA)[Lang];
interface SettingsValue {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  t: Dict;
  u: UIStrings;
  x: Extra;
  ready: boolean;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setS(parseSettings(raw)))
      .catch(() => setS(DEFAULTS))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SettingsValue>(() => ({
    s,
    ready,
    set: (patch) => setS((old) => {
      const next = { ...old, ...patch };
      // Losing a preference is not worth an error on screen.
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    }),
    t: DICTS[s.lang],
    u: UI[s.lang],
    x: EXTRA[s.lang],
  }), [s, ready]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
