import { DEFAULTS, parseSettings } from "@/settings";

test("falls back to defaults for missing or broken storage", () => {
  expect(parseSettings(null)).toEqual(DEFAULTS);
  expect(parseSettings("{not json")).toEqual(DEFAULTS);
  expect(parseSettings(JSON.stringify({ lang: "xx", theme: "blue", apiUrl: 3 }))).toEqual(DEFAULTS);
});

test("keeps valid stored values", () => {
  const s = parseSettings(JSON.stringify({ lang: "en", theme: "light", apiUrl: "https://a.trycloudflare.com" }));
  expect(s).toEqual({ lang: "en", theme: "light", apiUrl: "https://a.trycloudflare.com" });
});
