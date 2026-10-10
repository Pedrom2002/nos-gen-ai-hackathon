"""HTTP API for the review interface.

Run from the submission folder:
    uvicorn api.main:app --port 8000 --no-access-log

Documents only live in memory (no disk, no database) and can be deleted
through the API. Document text never goes to logs or error messages.
"""

import logging
import os
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse, Response
from dotenv import load_dotenv
from pydantic import BaseModel

from anonimizador import llm
from anonimizador.pipeline import anonymize_source
from anonimizador.pseudonymize import ask as gateway_ask
from anonimizador.report import build_report, to_markdown
from anonimizador.redact import RedactionError, redact
from anonimizador.review import apply_decisions
from anonimizador.sources import (MAX_OCR_PAGES, SUPPORTED, NeedsOcr,
                                  Source, TooManyPages, UnsupportedFormat,
                                  load_source)
from anonimizador.verify import check_leaks

SUBMISSION_DIR = Path(__file__).resolve().parents[1]
OFFICIAL_PDF = SUBMISSION_DIR.parent / "raw_data" / "document_to_anonymize.pdf"
# Phone photos at full resolution often pass 10 MB.
MAX_BYTES = 25 * 1024 * 1024
UNSUPPORTED = ("Formato não suportado: use PDF, DOCX, imagem (PNG, JPG), "
               "TXT ou CSV.")
MODEL_DOWN = "O modelo não respondeu. Tente de novo dentro de um minuto."

# Request logs would contain document names; keep them off.
logging.getLogger("uvicorn.access").disabled = True

DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def cors_origins(value: str | None) -> list[str]:
    """Allowed origins: the Vite dev server plus ALLOWED_ORIGINS.

    ALLOWED_ORIGINS is a comma-separated list, e.g. the Lovable preview
    "https://<id>.lovable.app". "*" is refused so a deployed API is never
    open to every site.
    """
    extra = [o.strip().rstrip("/") for o in (value or "").split(",")]
    extra = [o for o in extra if o and o != "*"]
    return DEV_ORIGINS + [o for o in extra if o not in DEV_ORIGINS]


load_dotenv(SUBMISSION_DIR / ".env")
app = FastAPI(title="Enxada de Pedra - anonimizador", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(os.environ.get("ALLOWED_ORIGINS")),
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_fn(*args, **kwargs):
    """Model call; replaced in tests."""
    return llm.generate(*args, **kwargs)


@dataclass
class Session:
    name: str
    source: Source
    lines: list[str]
    result: object
    items: list[dict]
    keep: set[str] = field(default_factory=set)
    output: list[str] = field(default_factory=list)
    masked: list = field(default_factory=list)

    def masked_items(self) -> list[dict]:
        return [i for i in self.items if i["id"] not in self.keep]


STORE: dict[str, Session] = {}


class Decisions(BaseModel):
    keep: list[str] = []


class Question(BaseModel):
    question: str


def _session(doc_id: str) -> Session:
    if doc_id not in STORE:
        raise HTTPException(404, "Documento não encontrado ou já apagado.")
    return STORE[doc_id]


def _summary(items: list[dict]) -> dict:
    return {
        "items": len(items),
        "masked_words": sum(i["words"] for i in items),
        "by_category": dict(Counter(i["category"] for i in items)),
    }


def _state(doc_id: str, session: Session) -> dict:
    return {
        "id": doc_id,
        "name": session.name,
        "lines": session.lines,
        "output": session.output,
        "items": [dict(item, kept=item["id"] in session.keep)
                  for item in session.items],
        "summary": _summary(session.masked_items()),
        "leaks": check_leaks(session.lines, session.output, session.masked),
        "kind": session.source.kind,
        "redactable": session.source.redactable,
        "uncertain": len(session.source.uncertain),
        "unread": session.source.unread,
    }


def _read(data: bytes, suffix: str) -> Source:
    try:
        return load_source(data, suffix)
    except UnsupportedFormat:
        raise HTTPException(415, UNSUPPORTED) from None
    except TooManyPages:
        raise HTTPException(
            413, f"O PDF digitalizado tem mais de {MAX_OCR_PAGES} páginas: "
                 f"divida-o em partes.") from None
    except NeedsOcr:
        raise HTTPException(
            422, "Este ficheiro precisa de OCR, mas o Tesseract com "
                 "português não está instalado no servidor.") from None
    except Exception:
        # Never echo the parser's message: it could quote the document.
        raise HTTPException(
            422, "Não foi possível ler o ficheiro. Confirme que não está "
                 "danificado nem protegido por palavra-passe.") from None


def _create(name: str, source: Source) -> dict:
    if not source.lines:
        raise HTTPException(
            422, "O documento não tem texto legível. Se for uma fotografia, "
                 "tente uma imagem mais nítida."
        )
    try:
        result = anonymize_source(source, generate_fn=generate_fn)
    except Exception:
        raise HTTPException(502, MODEL_DOWN) from None
    # Read after anonymize_source: OCR text has been fixed by then, and
    # the report, the leak check and the review must all use that text.
    lines = source.lines
    items = build_report(lines, result)["items"]
    doc_id = uuid.uuid4().hex[:12]
    STORE[doc_id] = Session(name, source, lines, result, items, set(),
                            list(result.lines), list(result.masked))
    return _state(doc_id, STORE[doc_id])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/documents")
async def upload(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED:
        raise HTTPException(415, UNSUPPORTED)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Ficheiro maior do que 25 MB.")
    # OCR and the model take seconds: run them off the event loop so other
    # requests are still served meanwhile.
    source = await run_in_threadpool(_read, data, suffix)
    return await run_in_threadpool(_create, file.filename, source)


@app.post("/api/documents/official")
def official() -> dict:
    data = OFFICIAL_PDF.read_bytes()
    return _create(OFFICIAL_PDF.name, _read(data, ".pdf"))


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str) -> dict:
    return _state(doc_id, _session(doc_id))


@app.put("/api/documents/{doc_id}/decisions")
def set_decisions(doc_id: str, decisions: Decisions) -> dict:
    session = _session(doc_id)
    keep = set(decisions.keep)
    try:
        output, masked = apply_decisions(
            session.lines, session.result.masked, session.items, keep
        )
    except KeyError:
        raise HTTPException(422, "Há dados que já não existem neste "
                                 "documento. Recarregue a revisão.") from None
    session.keep, session.output, session.masked = keep, output, masked
    return _state(doc_id, session)


def _redacted(session: Session) -> Response:
    """The original file with the reviewer's current masks removed for good.

    Built on request from memory and verified before it is sent; nothing is
    written to disk.
    """
    if not session.source.redactable:
        raise HTTPException(404, "Este formato só tem saída em texto: use "
                                 "submission.")
    try:
        result = redact(session.source, session.masked, session.name)
    except RedactionError as error:
        raise HTTPException(422, str(error)) from None
    return Response(result.data, media_type=result.media_type, headers={
        "Content-Disposition":
            f"attachment; filename*=UTF-8''{quote(result.filename)}"})


@app.get("/api/documents/{doc_id}/download/{kind}")
def download(doc_id: str, kind: str) -> Response:
    session = _session(doc_id)
    if kind == "redacted":
        return _redacted(session)
    if kind == "submission":
        body, name = "\n".join(session.output) + "\n", "submission.txt"
    elif kind == "report":
        items = session.masked_items()
        body = to_markdown({"summary": _summary(items), "items": items})
        name = "report.md"
    else:
        raise HTTPException(404, "Use submission, report ou redacted.")
    return PlainTextResponse(
        body, headers={"Content-Disposition": f'attachment; filename="{name}"'}
    )


@app.post("/api/documents/{doc_id}/ask")
def ask(doc_id: str, question: Question) -> dict:
    session = _session(doc_id)
    if not question.question.strip():
        raise HTTPException(422, "Escreva uma pergunta.")
    current = SimpleNamespace(masked=session.masked,
                              entities=session.result.entities)
    try:
        return gateway_ask(session.lines, current, question.question,
                           generate_fn=generate_fn)
    except Exception:
        raise HTTPException(502, MODEL_DOWN) from None


@app.delete("/api/documents/{doc_id}", status_code=204)
def delete(doc_id: str) -> Response:
    _session(doc_id)
    del STORE[doc_id]
    return Response(status_code=204)
