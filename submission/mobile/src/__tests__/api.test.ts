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

test("gives up on a silent server with a clear message", async () => {
  const fetchFn = (_: string, init: RequestInit) =>
    new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  const api = createClient("h.example", fetchFn as unknown as typeof fetch, 50);
  await expect(api.health()).resolves.toBe(false);
  await expect(api.analyze({ text: "x" })).rejects.toThrow("Não foi possível ligar ao servidor");
});
