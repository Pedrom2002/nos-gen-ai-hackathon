"""Gemini client with a disk cache and retries.

Every response is cached on disk, keyed by a hash of the model, the
generation settings and the prompt, so repeated runs (prompt iterations,
demos) do not spend API quota. Temporary errors from the free tier (503
overload, 429 quota) are retried with exponential backoff.
"""

import hashlib
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

SUBMISSION_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = SUBMISSION_DIR / "data" / "cache"
DEFAULT_MODEL = "gemini-3.1-flash-lite"
RETRY_CODES = {429, 503}
MAX_RETRIES = 5
BASE_DELAY = 2.0


class MissingApiKeyError(RuntimeError):
    """Raised when GEMINI_API_KEY is not configured."""


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


def make_client() -> genai.Client:
    """Create a Gemini client using the key from submission/.env."""
    load_dotenv(SUBMISSION_DIR / ".env")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise MissingApiKeyError("GEMINI_API_KEY em falta no .env")
    return genai.Client(api_key=api_key)


def _call_with_retries(client, prompt: str, model: str, temperature: float,
                       json_output: bool, sleep) -> str:
    config = types.GenerateContentConfig(
        temperature=temperature,
        response_mime_type="application/json" if json_output else None,
    )
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model=model, contents=prompt, config=config
            )
        except errors.APIError as exc:
            if exc.code not in RETRY_CODES or attempt == MAX_RETRIES:
                raise
            sleep(BASE_DELAY * 2 ** attempt)
            continue
        if not response.text:
            raise RuntimeError(f"Resposta vazia do modelo {model}")
        return response.text
    raise AssertionError("unreachable")


def generate(prompt: str, model: str = DEFAULT_MODEL,
             temperature: float = 0.0, json_output: bool = False, *,
             cache_dir: str | Path = CACHE_DIR, client=None,
             sleep=time.sleep) -> str:
    """Send a prompt to Gemini and return the response text.

    Cached responses are returned without calling the API. The client and
    the sleep function can be injected for tests.
    """
    key = cache_key(prompt, model, temperature, json_output)
    cache_file = Path(cache_dir) / f"{key}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))["response"]

    client = client or make_client()
    text = _call_with_retries(
        client, prompt, model, temperature, json_output, sleep
    )
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps({"model": model, "response": text}, ensure_ascii=False),
        encoding="utf-8",
    )
    return text
