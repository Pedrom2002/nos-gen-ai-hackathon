// Browser storage is not always available: Safari refuses it for embedded frames,
// private windows and privacy extensions can make reading or writing throw, and some
// web views have no storage at all. Every access in this app goes through these
// helpers so a refused storage area degrades quietly instead of crashing the page.

type Area = "local" | "session";

function area(name: Area): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return name === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string, name: Area = "local"): string | null {
  try {
    return area(name)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string, name: Area = "local"): void {
  try {
    area(name)?.setItem(key, value);
  } catch {
    // Nothing to do: the app keeps working with the value simply not remembered.
  }
}

export function removeStorage(key: string, name: Area = "local"): void {
  try {
    area(name)?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
