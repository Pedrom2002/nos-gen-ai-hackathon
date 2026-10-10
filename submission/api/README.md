# API

FastAPI backend for the review interface. It reuses the tested pipeline (`anonimizador/`) and adds the reviewer's decisions, uploads and privacy rules.

## Run

```bash
cd submission
pip install -r requirements.txt
uvicorn api.main:app --port 8000 --no-access-log
```

Interactive docs: http://localhost:8000/docs. CORS allows the Vite dev server (`http://localhost:5173`); in the frontend, proxy `/api` to `http://localhost:8000`.

Other frontends (for example the Lovable preview) are added in `submission/.env`, comma separated, with no trailing slash. `"*"` is ignored on purpose. Restart uvicorn after changing it.

```bash
ALLOWED_ORIGINS=https://<id>.lovable.app
```

## Privacy

- Documents live only in memory: no disk, no database. `DELETE /api/documents/{id}` removes one.
- Request logging is disabled, and document text never appears in logs or error messages.
- Uploads: PDF (text or scanned), DOCX, PNG, JPG, WebP, TXT (UTF-8, UTF-16, Windows-1252) or CSV, at most 25 MB (scanned PDFs: 20 pages). Images and scans are read by Tesseract on the server; they never go to the model, only their text does.

## Routes

| Method | Route | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ "status": "ok" }` |
| POST | `/api/documents` | multipart `file` | `DocumentState` |
| POST | `/api/documents/official` | | `DocumentState` for the official NOS PDF |
| GET | `/api/documents/{id}` | | `DocumentState` |
| PUT | `/api/documents/{id}/decisions` | `{ "keep": ["L5-1"] }` | `DocumentState` after the review |
| GET | `/api/documents/{id}/download/submission` | | `submission.txt` (masked text) |
| GET | `/api/documents/{id}/download/report` | | `report.md` (values hidden) |
| GET | `/api/documents/{id}/download/redacted` | | the original file with the masked words removed for good (PNG for images, PDF, DOCX), with the review applied; 404 for TXT/CSV, 422 if the safety checks fail |
| POST | `/api/documents/{id}/ask` | `{ "question": "..." }` | `GatewayAnswer` |
| DELETE | `/api/documents/{id}` | | 204 |

`PUT /decisions` always sends the full list of items to keep visible; an empty list masks everything again.

Errors return `{ "detail": "<message in Portuguese>" }`: 404 unknown document, 413 file too large, 415 unsupported format, 422 empty or unreadable document, empty question, unknown item or a redacted file that failed verification, 502 the model did not answer (try again).

## Types

```ts
type Category =
  | "Pessoa" | "Identificação" | "Contacto" | "Financeiro" | "Biométrico";

interface Item {
  id: string;          // "L5-1": line 5, first word index 1
  line: number;        // 1-based line in `lines`
  first: number;       // first and last word index in that line (0-based,
  last: number;        // words split on whitespace)
  words: number;
  text: string;        // original value (shown only in the local UI)
  category: Category;
  role: string;        // "titular" | "familiar" | "contacto" | "profissional" | "outro" | ""
  reason: string;      // why it was masked
  source: "modelo" | "rede de segurança";
  kept: boolean;       // true if the reviewer chose to keep it visible
}

interface DocumentState {
  id: string;
  name: string;
  lines: string[];     // original lines (empty lines removed)
  output: string[];    // masked lines, same layout as `lines`
  items: Item[];
  summary: {
    items: number;
    masked_words: number;
    by_category: Partial<Record<Category, number>>;
  };
  leaks: {
    checked: number;   // masked values verified in the output
    leaks: { line: number; text: string }[];  // empty = "0 fugas"
  };
  kind: "text" | "pdf" | "scanned" | "image" | "docx";
  redactable: boolean; // true if download/redacted is available
  uncertain: number;   // OCR words read with low confidence (masked if
                       // they look like identifiers)
  unread: number;      // text lines OCR saw but could not read; when > 0
                       // download/redacted answers 422
}

interface GatewayAnswer {
  model_saw: string;   // prompt sent to the model, placeholders only
  model_answer: string;
  answer: string;      // answer with the real values restored
  placeholders: number;
}
```

## Example

```bash
curl -X POST localhost:8000/api/documents/official
curl -X PUT localhost:8000/api/documents/<id>/decisions \
     -H "Content-Type: application/json" -d '{"keep": ["L5-1"]}'
curl -X POST localhost:8000/api/documents/<id>/ask \
     -H "Content-Type: application/json" \
     -d '{"question": "Que medicação toma a paciente?"}'
```
