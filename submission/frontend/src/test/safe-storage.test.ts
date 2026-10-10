import { describe, expect, it } from "vitest";
import { readStorage, removeStorage, writeStorage } from "@/lib/safe-storage";

function blockStorage(name: "localStorage" | "sessionStorage") {
  const original = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, {
    configurable: true,
    get() { throw new DOMException("The operation is insecure.", "SecurityError"); },
  });
  return () => {
    if (original) Object.defineProperty(window, name, original);
    else delete (window as unknown as Record<string, unknown>)[name];
  };
}

describe("safe storage", () => {
  it("reads, writes and removes while the browser allows storage", () => {
    writeStorage("lethe.test.key", "blue");
    expect(readStorage("lethe.test.key")).toBe("blue");
    removeStorage("lethe.test.key");
    expect(readStorage("lethe.test.key")).toBeNull();
  });

  it("reads and writes session storage separately from local storage", () => {
    writeStorage("lethe.test.session", "1", "session");
    expect(readStorage("lethe.test.session", "session")).toBe("1");
    expect(readStorage("lethe.test.session", "local")).toBeNull();
    removeStorage("lethe.test.session", "session");
    expect(readStorage("lethe.test.session", "session")).toBeNull();
  });

  it("never throws when the browser refuses both storage areas", () => {
    const restoreLocal = blockStorage("localStorage");
    const restoreSession = blockStorage("sessionStorage");
    try {
      expect(() => writeStorage("lethe.test.key", "x")).not.toThrow();
      expect(() => writeStorage("lethe.test.key", "x", "session")).not.toThrow();
      expect(() => removeStorage("lethe.test.key")).not.toThrow();
      expect(() => removeStorage("lethe.test.key", "session")).not.toThrow();
      expect(readStorage("lethe.test.key")).toBeNull();
      expect(readStorage("lethe.test.key", "session")).toBeNull();
    } finally {
      restoreLocal();
      restoreSession();
    }
  });
});
