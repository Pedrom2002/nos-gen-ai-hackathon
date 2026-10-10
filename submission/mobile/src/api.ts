// Talks to the Lethe API (submission/api). Same routes and model as the web
// frontend; the mapping from the API state comes from the shared api-model.
import { File, Paths } from "expo-file-system";

import { demoAnalysis, describe, filenameFrom, fromState, type AnalysisResult, type DocumentState } from "@web/lib/api-model";

/** A file chosen with the camera, the gallery or the file picker. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export class ApiError extends Error {}

const OFFLINE = "Não foi possível ligar ao servidor. Confirme o endereço nas definições.";

/** What people type ("abc.trycloudflare.com/") as a base URL; "" when empty. */
export function normalizeBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface ApiClient {
  /** No API address: answers come from the shared demo results. */
  demo: boolean;
  health(): Promise<boolean>;
  analyze(input: { file?: PickedFile; text?: string }): Promise<AnalysisResult>;
  /** Item ids kept visible by the reviewer; returns the refreshed summary. */
  decide(docId: string, keep: string[]): Promise<string>;
  /** The original file with the masked words removed, saved in the cache. */
  redacted(docId: string): Promise<{ uri: string; filename: string; mime: string }>;
  report(docId: string): Promise<string>;
  remove(docId: string): Promise<void>;
}

export function createClient(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 120_000,
  demoDelayMs = 1500,
): ApiClient {
  const base = normalizeBase(baseUrl);

  if (!base) {
    return {
      demo: true,
      health: async () => false,
      analyze: async ({ text }) => {
        await new Promise((r) => setTimeout(r, demoDelayMs));
        return demoAnalysis(text ?? "");
      },
      decide: async () => "",
      redacted: async () => { throw new ApiError("No modo demo não há ficheiro censurado: defina o endereço da API."); },
      report: async () => "",
      remove: async () => {},
    };
  }

  /** fetch with a timeout; network failures become one clear message. */
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`${base}/api${path}`, { ...init, signal: controller.signal });
    } catch {
      throw new ApiError(OFFLINE);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let detail = `O servidor respondeu com erro ${res.status}.`;
      try {
        const body = (await res.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch { /* not JSON */ }
      throw new ApiError(detail);
    }
    return res;
  }

  return {
    demo: false,
    async health() {
      try {
        await call("/health");
        return true;
      } catch {
        return false;
      }
    },
    async analyze({ file, text }) {
      // React Native's FormData only sends files as {uri, name, type}; a Blob
      // loses its name and the API needs the ".txt" to read it. Pasted text
      // is written to the cache first and sent like any other file.
      let upload = file;
      if (!upload) {
        const draft = new File(Paths.cache, "documento.txt");
        if (draft.exists) draft.delete();
        draft.write(text ?? "");
        upload = { uri: draft.uri, name: "documento.txt", type: "text/plain" };
      }
      const form = new FormData();
      form.append("file", { uri: upload.uri, name: upload.name, type: upload.type } as unknown as Blob);
      const res = await call("/documents", { method: "POST", body: form });
      return fromState((await res.json()) as DocumentState);
    },
    async decide(docId, keep) {
      const res = await call(`/documents/${docId}/decisions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep }),
      });
      return describe((await res.json()) as DocumentState);
    },
    async redacted(docId) {
      const res = await call(`/documents/${docId}/download/redacted`);
      const filename = filenameFrom(res.headers.get("content-disposition"), "documento_censurado");
      const mime = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
      const target = new File(Paths.cache, filename);
      if (target.exists) target.delete();
      target.write(new Uint8Array(await res.arrayBuffer()));
      return { uri: target.uri, filename, mime };
    },
    async report(docId) {
      return (await call(`/documents/${docId}/download/report`)).text();
    },
    async remove(docId) {
      await call(`/documents/${docId}`, { method: "DELETE" });
    },
  };
}
