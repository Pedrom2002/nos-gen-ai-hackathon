"""LLM client with a disk cache and retries, for Gemini or a local model.

The provider is chosen in submission/.env with LLM_PROVIDER:

- ``gemini`` (default): the Gemini API, with GEMINI_API_KEY;
- ``ollama``: a local Ollama server (OLLAMA_HOST, default
  http://localhost:11434), through its native /api/generate route;
- ``openai``: any server that speaks the OpenAI chat completions API
  (LM Studio, llama.cpp, vLLM, ...) at OPENAI_BASE_URL.

LLM_MODEL overrides the default model of the provider. With a local
provider the document never leaves the machine.

Every response is cached on disk, keyed by a hash of the model, the
generation settings and the prompt, so repeated runs (prompt iterations,
demos) do not spend API quota or GPU time. Temporary errors (503
overload, 429 quota, dropped connections) are retried with exponential
backoff.
"""

import hashlib
import json
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

SUBMISSION_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = SUBMISSION_DIR / "data" / "cache"
PROVIDERS = ("gemini", "ollama", "openai")
# Default model of each provider. gemma3 is the open-weights cousin of the
# Gemini model used by default; on a small machine use gemma3:4b or
# llama3.1:8b (LLM_MODEL in .env). The openai provider has no default: the
# model is whatever the local server has loaded.
DEFAULT_MODELS = {
    "gemini": "gemini-3.1-flash-lite",
    "ollama": "gemma3:12b",
    "openai": "",
}
DEFAULT_OLLAMA_HOST = "http://localhost:11434"
DEFAULT_OPENAI_BASE_URL = "http://localhost:1234/v1"  # LM Studio
# Ollama's default context (a few thousand tokens) cuts long documents; a
# whole numbered document plus the instructions needs more.
DEFAULT_NUM_CTX = 8192
# Local models can take minutes on a long document.
LOCAL_TIMEOUT = 600.0
RETRY_CODES = {429, 503}
MAX_RETRIES = 5
BASE_DELAY = 2.0


class ConfigError(RuntimeError):
    """Raised when the provider is not configured (missing key, model...)."""


class MissingApiKeyError(ConfigError):
    """Raised when GEMINI_API_KEY is not configured."""


class ProviderUnavailableError(RuntimeError):
    """Raised when a local server is not running or lacks the model."""


class LocalServerError(RuntimeError):
    """An HTTP error from a local server; ``code`` is the status."""

    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


class InvalidResponseError(RuntimeError):
    """Raised when a response fails validation; it is not cached."""


def provider() -> str:
    """The provider chosen in .env (LLM_PROVIDER), ``gemini`` by default."""
    load_dotenv(SUBMISSION_DIR / ".env")
    name = (os.getenv("LLM_PROVIDER") or "gemini").strip().lower()
    if name not in PROVIDERS:
        raise ConfigError(
            f"LLM_PROVIDER desconhecido: {name!r} (use "
            + ", ".join(PROVIDERS) + ")"
        )
    return name


def default_model(name: str | None = None) -> str:
    """The model used when none is given: LLM_MODEL or the provider's."""
    name = name or provider()
    return (os.getenv("LLM_MODEL") or "").strip() or DEFAULT_MODELS[name]


PROVIDER = provider()
DEFAULT_MODEL = default_model(PROVIDER)


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, (errors.APIError, LocalServerError)):
        return exc.code in RETRY_CODES
    # Dropped connections ("Server disconnected without sending a
    # response") and timeouts are temporary too.
    return isinstance(exc, (httpx.TransportError, ConnectionError))


def cache_key(prompt: str, model: str, temperature: float,
              json_output: bool) -> str:
    """Return a stable hash for one generation request."""
    payload = json.dumps(
        {
            "model": model,
            "temperature": temperature,
            "json_output": json_output,
            "prompt": prompt,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class OllamaClient:
    """Ollama's native API (POST /api/generate), one answer per call."""

    def __init__(self, host: str = DEFAULT_OLLAMA_HOST,
                 num_ctx: int = DEFAULT_NUM_CTX,
                 timeout: float = LOCAL_TIMEOUT, transport=None):
        self.host = host.rstrip("/")
        self.num_ctx = num_ctx
        self._http = httpx.Client(timeout=timeout, transport=transport)

    def generate_text(self, prompt: str, model: str, temperature: float,
                      json_output: bool) -> str:
        body = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": self.num_ctx},
        }
        if json_output:
            body["format"] = "json"
        data = _post_json(self._http, f"{self.host}/api/generate", body,
                          server=f"Ollama em {self.host}", model=model)
        return data.get("response") or ""


class OpenAICompatibleClient:
    """Any server with the OpenAI chat completions API (LM Studio,
    llama.cpp, vLLM, Ollama's /v1...)."""

    def __init__(self, base_url: str = DEFAULT_OPENAI_BASE_URL,
                 api_key: str = "", timeout: float = LOCAL_TIMEOUT,
                 transport=None):
        self.base_url = base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(timeout=timeout, headers=headers,
                                  transport=transport)

    def generate_text(self, prompt: str, model: str, temperature: float,
                      json_output: bool) -> str:
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if json_output:
            body["response_format"] = {"type": "json_object"}
        data = _post_json(self._http, f"{self.base_url}/chat/completions",
                          body, server=f"servidor em {self.base_url}",
                          model=model)
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            raise LocalServerError(
                502, "Resposta inesperada do servidor (sem choices)"
            ) from None


def _post_json(http: httpx.Client, url: str, body: dict, *, server: str,
               model: str) -> dict:
    """POST ``body`` and return the JSON answer, with clear errors for a
    server that is down (not retried) and for HTTP errors (retried when
    temporary). Error messages never include the prompt."""
    try:
        response = http.post(url, json=body)
    except httpx.ConnectError as exc:
        raise ProviderUnavailableError(
            f"Não foi possível ligar ao {server}. Confirme que está a correr."
        ) from exc
    if response.status_code == 404:
        raise ProviderUnavailableError(
            f"Modelo {model!r} não encontrado no {server}. "
            f"Para o Ollama: ollama pull {model}"
        )
    if response.status_code >= 400:
        raise LocalServerError(
            response.status_code,
            f"O {server} respondeu {response.status_code}"
        )
    return response.json()


def make_client():
    """Create the client for the provider configured in submission/.env."""
    name = provider()
    if name == "ollama":
        return OllamaClient(
            host=os.getenv("OLLAMA_HOST") or DEFAULT_OLLAMA_HOST,
            num_ctx=int(os.getenv("OLLAMA_NUM_CTX") or DEFAULT_NUM_CTX),
        )
    if name == "openai":
        return OpenAICompatibleClient(
            base_url=os.getenv("OPENAI_BASE_URL") or DEFAULT_OPENAI_BASE_URL,
            api_key=os.getenv("OPENAI_API_KEY") or "",
        )
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise MissingApiKeyError("GEMINI_API_KEY em falta no .env")
    return genai.Client(api_key=api_key)


def _generate_once(client, prompt: str, model: str, temperature: float,
                   json_output: bool) -> str:
    if hasattr(client, "generate_text"):  # local provider
        return client.generate_text(prompt, model, temperature, json_output)
    config = types.GenerateContentConfig(
        temperature=temperature,
        response_mime_type="application/json" if json_output else None,
    )
    response = client.models.generate_content(
        model=model, contents=prompt, config=config
    )
    return response.text or ""


def _call_with_retries(client, prompt: str, model: str, temperature: float,
                       json_output: bool, sleep) -> str:
    for attempt in range(MAX_RETRIES + 1):
        try:
            text = _generate_once(client, prompt, model, temperature,
                                  json_output)
        except Exception as exc:
            if not _is_retryable(exc) or attempt == MAX_RETRIES:
                raise
            sleep(BASE_DELAY * 2 ** attempt)
            continue
        if not text:
            raise RuntimeError(f"Resposta vazia do modelo {model}")
        return text
    raise AssertionError("unreachable")


def _passes(validate, text: str) -> bool:
    try:
        validate(text)
    except Exception:
        return False
    return True


def generate(prompt: str, model: str = DEFAULT_MODEL,
             temperature: float = 0.0, json_output: bool = False, *,
             cache_dir: str | Path = CACHE_DIR, client=None,
             sleep=time.sleep, validate=None) -> str:
    """Send a prompt to the configured model and return the response text.

    Cached responses are returned without calling the model. ``validate``
    (optional) is called with the text before caching; if it raises, the
    response is not cached and InvalidResponseError is raised instead, so
    the caller can try again. A cached response that fails ``validate``
    (cached before the check existed) is ignored and requested again. The
    client and the sleep function can be injected for tests.
    """
    if not model:
        raise ConfigError("LLM_MODEL em falta no .env (modelo do servidor "
                          "local, por exemplo o nome carregado no LM Studio)")
    # cache_dir=None: no cache at all (the API: the answers quote the
    # document, so they are not written to disk).
    cache_file = None
    if cache_dir is not None:
        key = cache_key(prompt, model, temperature, json_output)
        cache_file = Path(cache_dir) / f"{key}.json"
    if cache_file is not None and cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))["response"]
        if validate is None or _passes(validate, cached):
            return cached

    client = client or make_client()
    text = _call_with_retries(
        client, prompt, model, temperature, json_output, sleep
    )
    if validate is not None:
        try:
            validate(text)
        except Exception as exc:
            raise InvalidResponseError(
                f"Resposta inválida do modelo {model}: {exc}"
            ) from exc
    if cache_file is not None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(
            json.dumps({"model": model, "response": text},
                       ensure_ascii=False),
            encoding="utf-8",
        )
    return text
