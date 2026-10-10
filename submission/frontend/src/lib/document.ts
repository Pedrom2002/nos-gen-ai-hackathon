// Shapes shared by the import, the result page and the exports. Pure types.

export type SourceKind = "pdf" | "image" | "text";

/** One whitespace-separated word on a page, in page units with a top-left origin. */
export interface GeoWord { text: string; line: number; x: number; y: number; w: number; h: number }

/**
 * A page of the source document. PDF pages use points at scale 1 with the
 * page rotation applied; images use the pixels of the (downscaled) bitmap.
 * `image` caches a render that import already produced (OCR'd pages, photos).
 */
export interface PageGeometry { width: number; height: number; words: GeoWord[]; ocr: boolean; image?: Blob }

export interface SourceDoc {
  kind: SourceKind;
  file: File;
  /** The text exactly as it was handed to the textarea. */
  text: string;
  /** Empty for plain text. */
  pages: PageGeometry[];
  /** Some page came from OCR: the backend never gets the raw file then. */
  ocr: boolean;
  /** Object URL of the import-card thumbnail; owned by the document. */
  previewUrl: string | null;
}

export interface RedactionBox { page: number; x: number; y: number; w: number; h: number; entityId: string }
