// Único ponto de acesso ao backend (submission/api). Ver README → "Ligar ao backend".
import { demoAnalysis, describe, filenameFrom, fromState, type AnalysisResult, type DocumentState } from "@/lib/api-model";

// The pure model lives in lib/api-model.ts (shared with the mobile app).
export { spanText, fromState, filenameFrom, describe, demoAnalysis } from "@/lib/api-model";
export type { ApiItem, DocumentState, Detected, AnalysisResult } from "@/lib/api-model";

// "/" keeps the requests on the page's origin, where the Vite dev server
// proxies /api to the backend (vite.config.ts). A full URL calls it directly.
const RAW = import.meta.env["VITE_API_URL"] as string | undefined;
export const isMockMode = !RAW;
const BASE = (RAW ?? "").replace(/\/$/, "");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (!res.ok) {
    let detail = `O servidor respondeu com erro ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * The original file with the masked words removed for good, as the backend
 * builds it from the current review. The backend checks the file before it
 * sends it; when that check fails, the error says why and no file comes.
 */
export async function downloadRedacted(docId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE}/api/documents/${docId}/download/redacted`);
  if (!res.ok) {
    let detail = `O servidor respondeu com erro ${res.status}.`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return { blob: await res.blob(), filename: filenameFrom(res.headers.get("content-disposition"), "documento_censurado") };
}

/** Send the file itself when it was not edited, so a PDF is read the way run.py reads it. */
export async function analyzeDocument(text: string, file?: File | null): Promise<AnalysisResult> {
  if (!isMockMode) {
    const form = new FormData();
    form.append("file", file ?? new File([text], "documento.txt", { type: "text/plain" }));
    return fromState(await api<DocumentState>("/documents", { method: "POST", body: form }));
  }
  await new Promise((r) => setTimeout(r, 1500));
  return demoAnalysis(text);
}

/** Tell the backend which items the reviewer keeps visible; returns the refreshed summary. */
export async function syncDecisions(docId: string, keep: string[]): Promise<string> {
  const state = await api<DocumentState>(`/documents/${docId}/decisions`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep }),
  });
  return describe(state);
}

export async function deleteDocument(docId: string): Promise<void> {
  await api<void>(`/documents/${docId}`, { method: "DELETE" });
}
