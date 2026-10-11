# API

FastAPI backend for the review interface. It reuses the tested pipeline (`anonimizador/`) and adds the reviewer's decisions, uploads and privacy rules.

## Run

```bash
cd submission
pip install -r requirements.txt
uvicorn api.main:app --port 8000 --no-access-log
```

The model is chosen in `submission/.env`: Gemini by default (`GEMINI_API_KEY`), or a local model with `LLM_PROVIDER=ollama` (Ollama) or `LLM_PROVIDER=openai` (LM Studio, llama.cpp, vLLM and other servers with the OpenAI chat API). See "Local models" below.

Interactive docs: http://localhost:8000/docs. CORS allows the Vite dev server (`http://localhost:5173`); in the frontend, proxy `/api` to `http://localhost:8000`.

Other frontends (for example the Lovable preview) are added in `submission/.env`, comma separated, with no trailing slash. `"*"` is ignored on purpose. Restart uvicorn after changing it.

```bash
ALLOWED_ORIGINS=https://<id>.lovable.app
```

## Privacy

- Documents live only in memory: no disk, no database, and the model's answers are not cached either. At most 30 documents are kept (the least recently used goes first) and one idle for 30 minutes is dropped; `DELETE /api/documents/{id}` removes one at once. Ids are 22 random URL-safe characters.
- Request logging is disabled, and document text never appears in logs or error messages.
- With a local provider the text never leaves the machine; `GET /api/health` says which provider is in use.
- Uploads: PDF (text or scanned), DOCX, PNG, JPG, WebP, TXT (UTF-8, UTF-16, Windows-1252) or CSV, at most 25 MB; a DOCX that unpacks past 50 MB, an image over 80 megapixels, a scanned PDF over 20 pages or a document over 8 000 words is refused (413) before any model call, and a binary file named `.txt` is refused as unsupported (415). Images and scans are read by Tesseract on the server; they never go to the model, only their text does.

## Routes

| Method | Route | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ "status": "ok", "provider": "gemini", "model": "gemini-3.1-flash-lite", "local": false }` |
| POST | `/api/documents` | multipart `file` | `DocumentState` |
| POST | `/api/documents/official` | | `DocumentState` for the official NOS PDF |
| GET | `/api/documents/{id}` | | `DocumentState` |
| PUT | `/api/documents/{id}/decisions` | `{ "keep": ["L5-1"] }` | `DocumentState` after the review |
| GET | `/api/documents/{id}/download/submission` | | `submission.txt` (masked text) |
| GET | `/api/documents/{id}/download/report` | | `report.md` (values hidden) |
| GET | `/api/documents/{id}/download/redacted` | | the original file with the masked words removed for good (PNG for images, PDF, DOCX, CSV with the masked cells), with the review applied; 404 for TXT, 422 if the safety checks fail |
| POST | `/api/documents/{id}/ask` | `{ "question": "..." }` | `GatewayAnswer` |
| DELETE | `/api/documents/{id}` | | 204 |

`PUT /decisions` always sends the full list of items to keep visible; an empty list masks everything again.

A CSV is read cell by cell: each row becomes a line with the cells separated by the delimiter on its own (`Maria Santos , 123456789 , maria@x.pt`), so every value is its own item and the separators are never masked. `download/submission` gives that layout; `download/redacted` gives the CSV again, with the masked cells and the same delimiter.

Errors return `{ "detail": "<message in Portuguese>" }`: 404 unknown, expired or deleted document, 413 file too large (see the limits above), 415 unsupported format, 422 empty or unreadable document, empty question, unknown item or a redacted file that failed verification, 502 the model did not answer (try again), 503 the model is not configured or the local server is not running (the message says what to fix: the key, `ollama pull <model>`, start the server).

## Local models

```bash
# Ollama (https://ollama.com): install, then
ollama pull gemma3:12b              # or gemma3:4b / llama3.1:8b on a small machine
# in submission/.env
LLM_PROVIDER=ollama
LLM_MODEL=gemma3:12b                # optional, this is the default
OLLAMA_HOST=http://localhost:11434  # optional
OLLAMA_NUM_CTX=8192                 # optional; long documents need more than Ollama's default

# LM Studio, llama.cpp server, vLLM... (OpenAI chat completions API)
LLM_PROVIDER=openai
LLM_MODEL=<name of the loaded model>
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=                     # only if the server asks for one
```

The same `.env` drives `run.py`, `ask.py` and the evaluation scripts. Their answers are cached in `data/cache/` by model and prompt, so switching models does not reuse Gemini's answers (the API never caches). Small local models follow the "repeat every line" instruction less reliably than Gemini; the pipeline rejects answers that drop more than 20% of the words and retries at higher temperatures, so expect slower runs and the occasional 502 with models under 8B parameters.

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
  kind: "text" | "csv" | "pdf" | "scanned" | "image" | "docx";
  redactable: boolean; // true if download/redacted is available
  uncertain: number;   // OCR words read with low confidence (masked if
                       // they look like identifiers)
  unread: number;      // text lines OCR saw but could not read; when > 0
                       // redactable is false and download/redacted answers 422
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
