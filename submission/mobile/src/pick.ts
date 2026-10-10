// Getting a document into the app: camera, gallery or files, checked against
// what the API accepts before anything is uploaded.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import type { PickedFile } from "@/api";
import type { SourceKind } from "@/session";

/** The API refuses bigger uploads (api/main.py MAX_BYTES). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const BY_EXTENSION: Record<string, SourceKind> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
  ".pdf": "pdf", ".docx": "docx", ".txt": "text", ".csv": "text",
};
const BY_MIME: Record<string, SourceKind> = {
  "image/png": "image", "image/jpeg": "image", "image/webp": "image",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "text", "text/csv": "text",
};
const DOCUMENT_TYPES = [...Object.keys(BY_MIME)];

/** What a file is for the API, by extension first and type as a fallback. */
export function kindOfName(name: string, mime?: string): SourceKind | null {
  const ext = /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? "";
  return BY_EXTENSION[ext] ?? (mime ? BY_MIME[mime.toLowerCase()] ?? null : null);
}

export type Check = { ok: true; kind: SourceKind } | { ok: false; reason: "size" | "type" };

export function checkPicked(f: PickedFile): Check {
  const kind = kindOfName(f.name, f.type);
  if (!kind) return { ok: false, reason: "type" };
  if (f.size !== undefined && f.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "size" };
  return { ok: true, kind };
}

/** "26 MB", "0,5 MB": sizes for messages, in the Portuguese style. */
export function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10).toString().replace(".", ",")} MB`;
}

/** null: the person cancelled; "denied": no permission. */
export type PickOutcome = PickedFile | null | "denied";

function fromImage(result: ImagePicker.ImagePickerResult): PickOutcome {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? "image/jpeg";
  const name = asset.fileName ?? `foto.${type === "image/png" ? "png" : "jpg"}`;
  return { uri: asset.uri, name, type, size: asset.fileSize };
}

export async function takePhoto(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return "denied";
  // Full quality: OCR reads small print better; the API takes up to 25 MB.
  return fromImage(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: false }));
}

export async function pickImage(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return "denied";
  return fromImage(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false }));
}

export async function pickFile(): Promise<PickOutcome> {
  const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_TYPES, copyToCacheDirectory: true });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream", size: asset.size };
}
