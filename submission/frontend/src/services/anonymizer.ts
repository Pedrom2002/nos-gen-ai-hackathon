// Único ponto de acesso ao backend (submission/api). Ver README → "Ligar ao backend".
import { demoAnalysis, describe, filenameFrom, fromBatch, fromState, type AnalysisResult, type BatchResponse, type BatchResult, type DocumentState } from "@/lib/api-model";

// The pure model lives in lib/api-model.ts (shared with the mobile app).
export { spanText, fromState, fromBatch, filenameFrom, describe, demoAnalysis } from "@/lib/api-model";
export type { ApiItem, DocumentState, Detected, AnalysisResult, BatchEntry, BatchResponse, BatchResult } from "@/lib/api-model";

// "/" keeps the requests on the page's origin, where the Vite dev server
// proxies /api to the backend (vite.config.ts). A full URL calls it directly.
const RAW = import.meta.env["VITE_API_URL"] as string | undefined;
export const isMockMode = !RAW;
const BASE = (RAW ?? "").replace(/\/$/, "");

async function failure(res: Response): Promise<Error> {
  let detail = `O servidor respondeu com erro ${res.status}.`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch { /* not JSON */ }
  return new Error(detail);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (!res.ok) throw await failure(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** A file the backend builds; the error, when there is one, says why no file comes. */
async function apiBlob(path: string, fallbackName: string, init?: RequestInit): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (!res.ok) throw await failure(res);
  return { blob: await res.blob(), filename: filenameFrom(res.headers.get("content-disposition"), fallbackName) };
}

/**
 * The original file with the masked words removed for good, as the backend
 * builds it from the current review. The backend checks the file before it
 * sends it; when that check fails, the error says why and no file comes.
 */
export function downloadRedacted(docId: string): Promise<{ blob: Blob; filename: string }> {
  return apiBlob(`/documents/${docId}/download/redacted`, "documento_censurado");
}

/** One zip with submission.txt, report.md and the redacted file of every document given. */
export function downloadZip(ids: string[]): Promise<{ blob: Blob; filename: string }> {
  return apiBlob("/documents/zip", "lethe-documentos.zip", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
  });
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

/**
 * Several files in one request, each becoming its own document. The answer
 * has one entry per file, in order: a result, or the reason that file was
 * refused while the others went through.
 */
export async function analyzeDocuments(files: File[]): Promise<BatchResult[]> {
  if (!isMockMode) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return fromBatch(await api<BatchResponse>("/documents/batch", { method: "POST", body: form }));
  }
  await new Promise((r) => setTimeout(r, 1500));
  return Promise.all(files.map(async (file) => ({ name: file.name, result: demoAnalysis(await file.text()) })));
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
