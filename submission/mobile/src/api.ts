// Talks to the Lethe API (submission/api). Same routes and model as the web
// frontend; the mapping from the API state comes from the shared api-model.
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

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

/**
 * @param timeoutMs quick calls (connection test, delete)
 * @param longTimeoutMs analysis and redacted file: a full-size photo goes up
 *   over mobile data, then OCR and the model run; that can take minutes.
 */
export function createClient(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 15_000,
  demoDelayMs = 1500,
  longTimeoutMs = 300_000,
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

  /** fetch with a timeout. A timeout and a refused request get different
   * messages, the second with the technical cause, so a failure can be
   * told apart from a slow analysis. */
  async function call(path: string, init: RequestInit = {}, limitMs = timeoutMs): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, limitMs);
    let res: Response;
    try {
      res = await fetchFn(`${base}/api${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new ApiError(`O servidor não respondeu a tempo (${Math.round(limitMs / 1000)} s). `
          + "Uma fotografia grande demora mais: tente outra vez, de preferência em Wi-Fi.");
      }
      const cause = error instanceof Error && error.message ? ` (${error.message})` : "";
      throw new ApiError(`${OFFLINE}${cause}`);
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
      // Expo's fetch (SDK 52+) sends a part from its name, type and bytes();
      // it refuses React Native's old {uri, name, type} ("Unsupported
      // FormDataPart implementation"). The name keeps the extension the API
      // needs: the picked file's own name, or documento.txt for pasted text.
      const part = file
        ? { name: file.name, type: file.type, bytes: () => new File(file.uri).bytes() }
        : { name: "documento.txt", type: "text/plain", bytes: async () => new TextEncoder().encode(text ?? "") };
      const form = new FormData();
      if (Platform.OS === "web") {
        // In a browser, FormData only takes real Blobs (anything else turns
        // into the text "[object Object]" and the API answers 422).
        const blob = file
          ? await (await fetch(file.uri)).blob()
          : new Blob([text ?? ""], { type: "text/plain" });
        form.append("file", blob, part.name);
      } else {
        form.append("file", part as unknown as Blob);
      }
      const res = await call("/documents", { method: "POST", body: form }, longTimeoutMs);
      return fromState((await res.json()) as DocumentState);
    },
    async decide(docId, keep) {
      const res = await call(`/documents/${docId}/decisions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep }),
      }, longTimeoutMs);
      return describe((await res.json()) as DocumentState);
    },
    async redacted(docId) {
      const res = await call(`/documents/${docId}/download/redacted`, {}, longTimeoutMs);
      const filename = filenameFrom(res.headers.get("content-disposition"), "documento_censurado");
      const mime = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
      const target = new File(Paths.cache, filename);
      if (target.exists) target.delete();
      target.write(new Uint8Array(await res.arrayBuffer()));
      return { uri: target.uri, filename, mime };
    },
    async report(docId) {
      return (await call(`/documents/${docId}/download/report`, {}, longTimeoutMs)).text();
    },
    async remove(docId) {
      await call(`/documents/${docId}`, { method: "DELETE" });
    },
  };
}
