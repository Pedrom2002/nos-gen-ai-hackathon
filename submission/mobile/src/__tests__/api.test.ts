const cacheFiles: Record<string, string> = {};
jest.mock("expo-file-system", () => ({
  Paths: { cache: {} },
  File: class {
    uri: string;
    exists = false;
    constructor(dirOrUri: unknown, name?: string) { this.uri = name ? `file:///cache/${name}` : String(dirOrUri); }
    write(content: string) { cacheFiles[this.uri] = content; }
    async bytes() { return new Uint8Array([1, 2, 3]); }
    delete() {}
  },
}));

import { ApiError, createClient, normalizeBase } from "@/api";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const STATE = {
  id: "d1", name: "f.jpg", lines: ["Nome: Rui"], output: ["Nome: *"], items: [],
  summary: { items: 0, masked_words: 0, by_category: {} }, leaks: { checked: 0, leaks: [] },
  kind: "image", redactable: true, unread: 0,
};

test("normalises the URL people type", () => {
  expect(normalizeBase(" abc.trycloudflare.com/ ")).toBe("https://abc.trycloudflare.com");
  expect(normalizeBase("http://192.168.1.5:8000//")).toBe("http://192.168.1.5:8000");
  expect(normalizeBase("   ")).toBe("");
});

test("no URL means demo mode", async () => {
  const api = createClient("", fetch, 1000, 0);
  expect(api.demo).toBe(true);
  const r = await api.analyze({ text: "Email: rui@x.pt" });
  expect(r.entities.some((e: { text: string }) => e.text === "rui@x.pt")).toBe(true);
  await expect(api.redacted("x")).rejects.toBeInstanceOf(ApiError);
});

test("uploads the file as multipart and maps the state", async () => {
  const fetchFn = jest.fn((url: string, init: RequestInit) => {
    expect(url).toBe("https://h.example/api/documents");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    return json(STATE);
  });
  const api = createClient("h.example", fetchFn as unknown as typeof fetch);
  const r = await api.analyze({ file: { uri: "file:///f.jpg", name: "f.jpg", type: "image/jpeg" } });
  expect(r.docId).toBe("d1");
  expect(r.redactable).toBe(true);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test("sends the review decisions and returns the new summary", async () => {
  const fetchFn = jest.fn((url: string, init: RequestInit) => {
    expect(url).toBe("https://h.example/api/documents/d1/decisions");
    expect(JSON.parse(String(init.body))).toEqual({ keep: ["L1-1"] });
    return json(STATE);
  });
  const api = createClient("h.example", fetchFn as unknown as typeof fetch);
  expect(await api.decide("d1", ["L1-1"])).toContain("Verificação de fugas");
});

test("shows the API's reason when it refuses", async () => {
  const fetchFn = () => json({ detail: "2 linha(s) de texto não foram lidas pelo OCR" }, 422);
  const api = createClient("h.example", fetchFn as unknown as typeof fetch);
  await expect(api.redacted("d1")).rejects.toThrow("não foram lidas pelo OCR");
});

test("a silent server: says it took too long, not that it is offline", async () => {
  const fetchFn = (_: string, init: RequestInit) =>
    new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  const api = createClient("h.example", fetchFn as unknown as typeof fetch, 50, 0, 80);
  await expect(api.health()).resolves.toBe(false);
  await expect(api.analyze({ text: "x" })).rejects.toThrow("não respondeu a tempo");
});

test("a request the network refuses: says so, with the technical cause", async () => {
  const fetchFn = () => Promise.reject(new TypeError("Network request failed"));
  const api = createClient("h.example", fetchFn as unknown as typeof fetch);
  await expect(api.analyze({ text: "x" })).rejects.toThrow(/Não foi possível ligar ao servidor.*Network request failed/);
});

test("reading a document may take minutes: the analysis waits longer than a health check", async () => {
  let health = 0;
  let analysis = 0;
  const fetchFn = (url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const started = Date.now();
    init.signal?.addEventListener("abort", () => {
      if (url.endsWith("/health")) health = Date.now() - started; else analysis = Date.now() - started;
      reject(new Error("aborted"));
    });
  });
  const api = createClient("h.example", fetchFn as unknown as typeof fetch, 40, 0, 200);
  await api.health();
  await expect(api.analyze({ text: "x" })).rejects.toThrow();
  expect(health).toBeLessThan(150);
  expect(analysis).toBeGreaterThanOrEqual(180);
});

test("sends a picked file by its bytes, keeping its name and type", async () => {
  const appended: [string, unknown][] = [];
  const realFormData = globalThis.FormData;
  globalThis.FormData = class {
    append(key: string, value: unknown) { appended.push([key, value]); }
  } as unknown as typeof FormData;
  try {
    const api = createClient("h.example", (() => json(STATE)) as unknown as typeof fetch);
    await api.analyze({ file: { uri: "file:///cache/foto.jpg", name: "foto.jpg", type: "image/jpeg" } });
  } finally {
    globalThis.FormData = realFormData;
  }
  const part = appended[0]?.[1] as { name: string; type: string; bytes(): Promise<Uint8Array>; uri?: string };
  expect(part.uri).toBeUndefined();
  expect(part).toMatchObject({ name: "foto.jpg", type: "image/jpeg" });
  expect(Array.from(await part.bytes())).toEqual([1, 2, 3]);
});

test("sends pasted text as a documento.txt file the API can read", async () => {
  // Jest runs on Node, whose FormData is not the one React Native uses:
  // record what is appended, which is what React Native would send.
  const appended: [string, unknown][] = [];
  const realFormData = globalThis.FormData;
  globalThis.FormData = class {
    append(key: string, value: unknown) { appended.push([key, value]); }
  } as unknown as typeof FormData;
  try {
    const api = createClient("h.example", (() => json(STATE)) as unknown as typeof fetch);
    await api.analyze({ text: "Nome: Rui Costa" });
  } finally {
    globalThis.FormData = realFormData;
  }
  // Expo's fetch reads parts with name, type and bytes(); it refuses the old
  // React Native {uri, name, type} ("Unsupported FormDataPart implementation").
  expect(appended).toHaveLength(1);
  const [key, part] = appended[0] as [string, { name: string; type: string; bytes(): Promise<Uint8Array>; uri?: string }];
  expect(key).toBe("file");
  expect(part.uri).toBeUndefined();
  expect(part).toMatchObject({ name: "documento.txt", type: "text/plain" });
  expect(new TextDecoder().decode(await part.bytes())).toBe("Nome: Rui Costa");
});

test("on the web build, files go as real Blobs with their name", async () => {
  const { Platform } = require("react-native") as typeof import("react-native");
  const appended: unknown[][] = [];
  const realFormData = globalThis.FormData;
  globalThis.FormData = class {
    append(...args: unknown[]) { appended.push(args); }
  } as unknown as typeof FormData;
  const realOS = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  try {
    const api = createClient("h.example", (() => json(STATE)) as unknown as typeof fetch);
    await api.analyze({ text: "Nome: Rui" });
  } finally {
    Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
    globalThis.FormData = realFormData;
  }
  const [key, blob, name] = appended[0] as [string, Blob, string];
  expect(key).toBe("file");
  expect(blob).toBeInstanceOf(Blob);
  expect(name).toBe("documento.txt");
  expect(await blob.text()).toBe("Nome: Rui");
});
