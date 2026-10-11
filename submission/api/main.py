"""HTTP API for the review interface.

Run from the submission folder:
    uvicorn api.main:app --port 8000 --no-access-log

Documents only live in memory (no disk, no database) and can be deleted
through the API. Document text never goes to logs or error messages.
"""

import logging
import os
import secrets
import threading
import time
from collections import Counter
from concurrent.futures import Future, ThreadPoolExecutor
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
                                  Source, TooLarge, TooManyPages,
                                  UnsupportedFormat, load_source)
from anonimizador.verify import check_leaks

SUBMISSION_DIR = Path(__file__).resolve().parents[1]
OFFICIAL_PDF = SUBMISSION_DIR.parent / "raw_data" / "document_to_anonymize.pdf"
# Phone photos at full resolution often pass 10 MB.
MAX_BYTES = 25 * 1024 * 1024
# Same output as run.py: punctuation next to a masked word stays ("*,").
KEEP_PUNCT = True
# The model returns every line again (about 6 tokens a word), and its answer
# has a limit: 8 000 words is a 20-page scan or a long contract.
MAX_WORDS = 8000
UNSUPPORTED = ("Formato não suportado: use PDF, DOCX, imagem (PNG, JPG, "
               "WebP), TXT ou CSV.")
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
    """Model call; replaced in tests. No disk cache: the answers quote the
    document, and the API keeps documents in memory only."""
    kwargs.setdefault("cache_dir", None)
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
    touched: float = field(default_factory=lambda: time.monotonic())
    # The redacted file being built (or built) for a set of masked
    # positions; see _start_redaction.
    redaction: tuple[tuple, Future] | None = None

    def masked_items(self) -> list[dict]:
        return [i for i in self.items if i["id"] not in self.keep]


STORE: dict[str, Session] = {}
# Documents live in memory only, and each keeps the original file (up to
# 25 MB): without a limit, uploads alone could fill the server's memory.
MAX_SESSIONS = 30
SESSION_TTL = 30 * 60        # seconds without use before a document is dropped
_STORE_LOCK = threading.Lock()
# Redacted files are built in the background as soon as the masks are known
# (upload, review): building and checking one takes seconds (a second OCR
# pass for a photo), and the interface asks for it twice, for the preview
# and for the download. A few at a time: each holds a decoded page.
REDACTION_POOL = ThreadPoolExecutor(max_workers=2,
                                    thread_name_prefix="redaction")


def new_id() -> str:
    """An id nobody can guess: the id is the only key to a document."""
    return secrets.token_urlsafe(16)


def _drop_expired() -> None:
    now = time.monotonic()
    for doc_id in [i for i, s in STORE.items()
                   if now - s.touched > SESSION_TTL]:
        del STORE[doc_id]


def _remember(doc_id: str, session: Session) -> None:
    """Keep a document, dropping the expired and then the least recently
    used ones so there are never more than MAX_SESSIONS."""
    with _STORE_LOCK:
        _drop_expired()
        while len(STORE) >= MAX_SESSIONS:
            del STORE[min(STORE, key=lambda i: STORE[i].touched)]
        STORE[doc_id] = session


class Decisions(BaseModel):
    keep: list[str] = []


class Question(BaseModel):
    question: str


def _session(doc_id: str) -> Session:
    with _STORE_LOCK:
        _drop_expired()
        session = STORE.get(doc_id)
        if session is None:
            raise HTTPException(
                404, "Documento não encontrado, expirado ou já apagado.")
        session.touched = time.monotonic()
        return session


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
        # The backend decides: a file with lines the OCR never read cannot
        # be verified, so it is not offered (download/redacted answers 422).
        "redactable": session.source.redactable and not session.source.unread,
        "uncertain": len(session.source.uncertain),
        "unread": session.source.unread,
    }


def _read(data: bytes, suffix: str) -> Source:
    try:
        return load_source(data, suffix)
    except UnsupportedFormat:
        raise HTTPException(415, UNSUPPORTED) from None
    except TooLarge as error:
        raise HTTPException(413, str(error)) from None
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
    words = sum(len(line.split()) for line in source.lines)
    if words > MAX_WORDS:
        # The model answers with every line again: a longer document would
        # not fit in one answer, and would only fail after a long wait.
        raise HTTPException(
            413, f"O documento tem {words} palavras; o máximo é {MAX_WORDS}. "
                 "Divida-o em partes.")
    try:
        result = anonymize_source(source, keep_punct=KEEP_PUNCT,
                                  generate_fn=generate_fn)
    except (llm.ConfigError, llm.ProviderUnavailableError) as error:
        raise HTTPException(503, str(error)) from None
    except Exception:
        raise HTTPException(502, MODEL_DOWN) from None
    # Read after anonymize_source: OCR text has been fixed by then, and
    # the report, the leak check and the review must all use that text.
    lines = source.lines
    items = build_report(lines, result)["items"]
    doc_id = new_id()
    session = Session(name, source, lines, result, items, set(),
                      list(result.lines), list(result.masked))
    _start_redaction(session)
    _remember(doc_id, session)
    return _state(doc_id, session)


def _mask_key(masked: list) -> tuple:
    return tuple((w.line, w.index) for w in masked)


def _start_redaction(session: Session) -> None:
    """Start building the redacted file for the session's current masks,
    unless the file for exactly these masks is already being built.

    Nothing is started when no file can be given (text formats, or lines
    the OCR never read): the request then explains why, as before.
    """
    if not session.source.redactable or session.source.unread:
        return
    key = _mask_key(session.masked)
    if session.redaction is not None:
        if session.redaction[0] == key:
            return
        # A superseded build that has not started yet is dropped.
        session.redaction[1].cancel()
    future = REDACTION_POOL.submit(redact, session.source, session.masked,
                                   session.name, KEEP_PUNCT)
    session.redaction = (key, future)


@app.get("/api/health")
def health() -> dict:
    """Liveness plus the model in use, so the interface can say whether the
    text goes to Gemini or stays on this machine (Ollama, LM Studio...)."""
    return {"status": "ok", "provider": llm.provider(),
            "model": llm.default_model(), "local": llm.provider() != "gemini"}


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
            session.lines, session.result.masked, session.items, keep,
            KEEP_PUNCT)
    except KeyError:
        raise HTTPException(422, "Há dados que já não existem neste "
                                 "documento. Recarregue a revisão.") from None
    session.keep, session.output, session.masked = keep, output, masked
    _start_redaction(session)
    return _state(doc_id, session)


def _redacted(session: Session) -> Response:
    """The original file with the reviewer's current masks removed for good.

    Built from memory and verified before it is sent; nothing is written to
    disk. The build started with the upload or the review (see
    _start_redaction) is used when it is for the current masks, so the
    preview and the download of the same review share one build.
    """
    if not session.source.redactable:
        raise HTTPException(404, "Este formato só tem saída em texto: use "
                                 "submission.")
    _start_redaction(session)
    try:
        if (session.redaction is not None
                and session.redaction[0] == _mask_key(session.masked)):
            result = session.redaction[1].result()
        else:
            result = redact(session.source, session.masked, session.name,
                            KEEP_PUNCT)
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
    except (llm.ConfigError, llm.ProviderUnavailableError) as error:
        raise HTTPException(503, str(error)) from None
    except Exception:
        raise HTTPException(502, MODEL_DOWN) from None


@app.delete("/api/documents/{doc_id}", status_code=204)
def delete(doc_id: str) -> Response:
    _session(doc_id)
    with _STORE_LOCK:
        STORE.pop(doc_id, None)
    return Response(status_code=204)
