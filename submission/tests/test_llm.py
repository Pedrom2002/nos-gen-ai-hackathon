import json
from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from anonimizador import llm


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, model, contents, config):
        self.calls.append(config)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


class FakeClient:
    def __init__(self, *outcomes):
        self.models = FakeModels(outcomes)


def server_error(code):
    return errors.ServerError(code, {"error": {"code": code}})


def client_error(code):
    return errors.ClientError(code, {"error": {"code": code}})


def test_second_call_is_served_from_cache(tmp_path):
    client = FakeClient("ok")
    first = llm.generate("Diz ok", cache_dir=tmp_path, client=client)
    second = llm.generate("Diz ok", cache_dir=tmp_path, client=client)
    assert first == second == "ok"
    assert len(client.models.calls) == 1
    assert len(list(tmp_path.glob("*.json"))) == 1


def test_without_a_cache_directory_nothing_is_read_or_written(tmp_path):
    client = FakeClient("a", "b")
    first = llm.generate("Diz ok", cache_dir=None, client=client)
    second = llm.generate("Diz ok", cache_dir=None, client=client)
    assert (first, second) == ("a", "b")
    assert len(client.models.calls) == 2
    assert list(tmp_path.iterdir()) == []


def test_the_api_never_caches_the_model_answers_on_disk(monkeypatch):
    from api import main

    seen = {}
    monkeypatch.setattr(
        llm, "generate", lambda *args, **kwargs: seen.update(kwargs) or "x")
    assert main.generate_fn("prompt", model="m") == "x"
    assert "cache_dir" in seen and seen["cache_dir"] is None


def test_cache_key_depends_on_model_and_settings():
    base = llm.cache_key("p", "model-a", 0.0, False)
    assert base != llm.cache_key("p", "model-b", 0.0, False)
    assert base != llm.cache_key("p", "model-a", 0.5, False)
    assert base != llm.cache_key("p", "model-a", 0.0, True)
    assert base == llm.cache_key("p", "model-a", 0.0, False)


def test_retries_on_503_and_429_with_backoff(tmp_path):
    client = FakeClient(server_error(503), client_error(429), "ok")
    delays = []
    text = llm.generate("p", cache_dir=tmp_path, client=client,
                        sleep=delays.append)
    assert text == "ok"
    assert delays == [2.0, 4.0]


def test_other_errors_are_not_retried(tmp_path):
    client = FakeClient(client_error(400), "ok")
    delays = []
    with pytest.raises(errors.ClientError):
        llm.generate("p", cache_dir=tmp_path, client=client,
                     sleep=delays.append)
    assert len(client.models.calls) == 1
    assert delays == []


def test_gives_up_after_max_retries(tmp_path):
    outcomes = [server_error(503)] * (llm.MAX_RETRIES + 1)
    client = FakeClient(*outcomes)
    delays = []
    with pytest.raises(errors.ServerError):
        llm.generate("p", cache_dir=tmp_path, client=client,
                     sleep=delays.append)
    assert len(delays) == llm.MAX_RETRIES
    assert not list(tmp_path.glob("*.json"))


def test_json_output_requests_json_mime_type(tmp_path):
    client = FakeClient("{}")
    llm.generate("p", json_output=True, cache_dir=tmp_path, client=client)
    assert client.models.calls[0].response_mime_type == "application/json"


def test_dropped_connection_is_retried(tmp_path):
    drop = httpx.RemoteProtocolError("Server disconnected")
    client = FakeClient(drop, "ok")
    delays = []
    assert llm.generate("p", cache_dir=tmp_path, client=client,
                        sleep=delays.append) == "ok"
    assert delays == [2.0]


def test_invalid_response_is_not_cached(tmp_path):
    def must_be_json(text):
        if not text.startswith("{"):
            raise ValueError("not json")

    with pytest.raises(llm.InvalidResponseError):
        llm.generate("p", cache_dir=tmp_path, client=FakeClient("oops"),
                     validate=must_be_json)
    assert not list(tmp_path.glob("*.json"))
    assert llm.generate("p", cache_dir=tmp_path, client=FakeClient("{}"),
                        validate=must_be_json) == "{}"


def test_missing_api_key_gives_clear_error(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "SUBMISSION_DIR", tmp_path)
    with pytest.raises(llm.MissingApiKeyError, match="GEMINI_API_KEY"):
        llm.generate("p", cache_dir=tmp_path)


# Local providers (Ollama and OpenAI-compatible servers), with a fake HTTP
# server so no model is needed.

def fake_server(handler):
    """httpx transport that answers with ``handler(request) -> response``
    and records the requests."""
    requests = []

    def handle(request):
        requests.append(request)
        return handler(request)

    return httpx.MockTransport(handle), requests


def ollama_client(handler, **kwargs):
    transport, requests = fake_server(handler)
    client = llm.OllamaClient(host="http://ollama.test/", transport=transport,
                              **kwargs)
    return client, requests


def test_ollama_sends_prompt_and_options(tmp_path):
    client, requests = ollama_client(
        lambda r: httpx.Response(200, json={"response": "{\"a\": 1}"}),
        num_ctx=4096)
    text = llm.generate("p", model="gemma3:4b", json_output=True,
                        temperature=0.3, cache_dir=tmp_path, client=client)
    assert text == "{\"a\": 1}"
    [request] = requests
    assert str(request.url) == "http://ollama.test/api/generate"
    body = json.loads(request.content)
    assert body == {"model": "gemma3:4b", "prompt": "p", "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.3, "num_ctx": 4096}}


def test_ollama_text_answers_do_not_force_json(tmp_path):
    client, requests = ollama_client(
        lambda r: httpx.Response(200, json={"response": "ok"}))
    assert llm.generate("p", model="m", cache_dir=tmp_path,
                        client=client) == "ok"
    assert "format" not in json.loads(requests[0].content)


def test_ollama_down_gives_clear_error_without_retrying(tmp_path):
    def refuse(request):
        raise httpx.ConnectError("Connection refused", request=request)

    client, requests = ollama_client(refuse)
    delays = []
    with pytest.raises(llm.ProviderUnavailableError, match="ollama.test"):
        llm.generate("p", model="m", cache_dir=tmp_path, client=client,
                     sleep=delays.append)
    assert delays == [] and len(requests) == 1


def test_ollama_missing_model_suggests_pull(tmp_path):
    client, _ = ollama_client(
        lambda r: httpx.Response(404, json={"error": "model not found"}))
    with pytest.raises(llm.ProviderUnavailableError,
                       match="ollama pull gemma3:4b"):
        llm.generate("p", model="gemma3:4b", cache_dir=tmp_path,
                     client=client)


def test_ollama_server_errors_are_retried(tmp_path):
    answers = [httpx.Response(503, text="busy"),
               httpx.Response(200, json={"response": "ok"})]
    client, requests = ollama_client(lambda r: answers.pop(0))
    delays = []
    assert llm.generate("p", model="m", cache_dir=tmp_path, client=client,
                        sleep=delays.append) == "ok"
    assert delays == [2.0] and len(requests) == 2


def test_ollama_other_http_errors_are_not_retried(tmp_path):
    client, requests = ollama_client(
        lambda r: httpx.Response(400, json={"error": "bad"}))
    with pytest.raises(llm.LocalServerError) as info:
        llm.generate("p", model="m", cache_dir=tmp_path, client=client,
                     sleep=lambda s: None)
    assert info.value.code == 400 and len(requests) == 1


def test_openai_compatible_chat_completions(tmp_path):
    transport, requests = fake_server(lambda r: httpx.Response(200, json={
        "choices": [{"message": {"role": "assistant", "content": "{}"}}]}))
    client = llm.OpenAICompatibleClient(base_url="http://lmstudio.test/v1",
                                        api_key="k", transport=transport)
    assert llm.generate("p", model="local", json_output=True,
                        cache_dir=tmp_path, client=client) == "{}"
    [request] = requests
    assert str(request.url) == "http://lmstudio.test/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer k"
    assert json.loads(request.content) == {
        "model": "local", "temperature": 0.0,
        "messages": [{"role": "user", "content": "p"}],
        "response_format": {"type": "json_object"}}


def test_openai_without_model_asks_for_llm_model(tmp_path):
    with pytest.raises(llm.ConfigError, match="LLM_MODEL"):
        llm.generate("p", model="", cache_dir=tmp_path, client=object())


def test_make_client_follows_llm_provider(monkeypatch, tmp_path):
    monkeypatch.setattr(llm, "SUBMISSION_DIR", tmp_path)
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_HOST", "http://box:11434/")
    monkeypatch.setenv("OLLAMA_NUM_CTX", "16384")
    client = llm.make_client()
    assert isinstance(client, llm.OllamaClient)
    assert (client.host, client.num_ctx) == ("http://box:11434", 16384)
    monkeypatch.setenv("LLM_MODEL", "")
    assert llm.default_model() == "gemma3:12b"
    monkeypatch.setenv("LLM_MODEL", "llama3.1:8b")
    assert llm.default_model() == "llama3.1:8b"

    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_BASE_URL", "http://lm:1234/v1")
    client = llm.make_client()
    assert isinstance(client, llm.OpenAICompatibleClient)
    assert client.base_url == "http://lm:1234/v1"

    monkeypatch.setenv("LLM_PROVIDER", "mistral")
    with pytest.raises(llm.ConfigError, match="LLM_PROVIDER"):
        llm.make_client()


def test_the_client_is_built_once_and_follows_the_configuration(
        tmp_path, monkeypatch):
    built = []

    def make_client():
        built.append(1)
        return FakeClient("a", "b", "c")

    monkeypatch.setattr(llm, "_CLIENTS", {})
    monkeypatch.setattr(llm, "make_client", make_client)
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "k1")
    assert llm.generate("p", cache_dir=None) == "a"
    assert llm.generate("q", cache_dir=None) == "b"
    assert len(built) == 1
    # Another key (or provider) is another client.
    monkeypatch.setenv("GEMINI_API_KEY", "k2")
    llm.generate("p", cache_dir=None)
    assert len(built) == 2


def test_a_client_that_cannot_be_built_is_not_cached(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "_CLIENTS", {})
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "SUBMISSION_DIR", tmp_path)
    with pytest.raises(llm.MissingApiKeyError):
        llm.generate("p", cache_dir=tmp_path)
    assert llm._CLIENTS == {}
