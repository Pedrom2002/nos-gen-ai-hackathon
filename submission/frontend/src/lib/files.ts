import type { SourceKind } from "@/lib/document";

// The one place that says which files Lethe opens. The input's accept list,
// the badges on the dropzone and the drop validation all read from here. It
// mirrors SUPPORTED in the backend (anonimizador/sources.py): PDF, DOCX,
// PNG, JPG, WebP, TXT and CSV.
const IMAGE_TYPES: Record<string, string[]> = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] };
const IMAGE_EXTENSIONS = Object.values(IMAGE_TYPES).flat();
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ACCEPT = [".pdf", ".docx", ".txt", ".csv", ...IMAGE_EXTENSIONS, "application/pdf", DOCX_TYPE, "text/plain", "text/csv", ...Object.keys(IMAGE_TYPES)].join(",");
export const BADGES = ["pdf", "docx", "txt", "csv", "png", "jpg", "webp"] as const;
/** The backend refuses bigger uploads (api/main.py); above this the text goes instead of the file. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Hard stop for what the browser will try to open. */
export const MAX_LOCAL_BYTES = 25 * 1024 * 1024;
/** Files one analysis can take at once; mirrors MAX_BATCH_FILES in api/main.py. */
export const MAX_BATCH_FILES = 10;

const extensionOf = (name: string) => { const m = /\.[^.]+$/.exec(name); return m ? m[0].toLowerCase() : ""; };

/** What a file is, by MIME type first and extension as a fallback; null when Lethe cannot open it. */
export function kindOf(file: Pick<File, "name" | "type">): SourceKind | null {
  const type = file.type.toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === DOCX_TYPE) return "docx";
  if (type in IMAGE_TYPES) return "image";
  if (type === "text/plain" || type === "text/csv") return "text";
  const ext = extensionOf(file.name);
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === ".txt" || ext === ".csv") return "text";
  return null;
}

export type Validation = { ok: true; kind: SourceKind } | { ok: false; reason: "type" | "size" };

export function validateFile(file: Pick<File, "name" | "type" | "size">): Validation {
  const kind = kindOf(file);
  if (!kind) return { ok: false, reason: "type" };
  if (file.size > MAX_LOCAL_BYTES) return { ok: false, reason: "size" };
  return { ok: true, kind };
}
