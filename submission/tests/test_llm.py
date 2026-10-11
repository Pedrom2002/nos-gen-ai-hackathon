from types import SimpleNamespace

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
    import httpx
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
