import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from anonimizador.metric import read_lines
from api import main

SUBMISSION = Path(__file__).resolve().parents[1]
GOLD = read_lines(SUBMISSION / "data" / "gold" / "gold.txt")
NAME = "Maria Conceição Oliveira Santos"

pytestmark = pytest.mark.skipif(not main.OFFICIAL_PDF.exists(),
                                reason="official PDF missing")


def fake_generate(prompt, model=None, json_output=False, **kwargs):
    if not json_output:  # gateway
        assert "Maria" not in prompt
        return "A paciente é [PESSOA_1]."
    if NAME in prompt:  # official document: answer with the reference
        return json.dumps({"masked_lines": GOLD, "entities": [
            {"text": NAME, "category": "Pessoa", "role": "titular",
             "reason": "Nome da paciente"}]})
    lines = re.findall(r"^L\d+: (.*)$", prompt, re.M)
    return json.dumps({"masked_lines": lines, "entities": []})


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "generate_fn", fake_generate)
    main.STORE.clear()
    return TestClient(main.app)


def official(client):
    response = client.post("/api/documents/official")
    assert response.status_code == 200
    return response.json()


def name_item(doc):
    return next(i for i in doc["items"] if i["text"] == NAME)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_official_document_is_anonymised_without_leaks(client):
    doc = official(client)
    assert len(doc["lines"]) == 60
    assert doc["output"] == GOLD
    assert doc["summary"]["masked_words"] == 46
    assert doc["leaks"]["leaks"] == []
    assert name_item(doc)["reason"] == "Nome da paciente"


def test_keeping_an_item_shows_it_again_and_can_be_undone(client):
    doc = official(client)
    item = name_item(doc)
    url = f"/api/documents/{doc['id']}/decisions"
    kept = client.put(url, json={"keep": [item["id"]]}).json()
    assert kept["output"][4] == f"Nome: {NAME}"
    assert kept["summary"]["masked_words"] == 42
    assert name_item(kept)["kept"] is True
    undone = client.put(url, json={"keep": []}).json()
    assert undone["output"] == GOLD


def test_unknown_item_is_rejected(client):
    doc = official(client)
    response = client.put(f"/api/documents/{doc['id']}/decisions",
                          json={"keep": ["L999-0"]})
    assert response.status_code == 422


def test_downloads_follow_the_review(client):
    doc = official(client)
    base = f"/api/documents/{doc['id']}/download"
    submission = client.get(f"{base}/submission")
    assert submission.text == "\n".join(GOLD) + "\n"
    assert "submission.txt" in submission.headers["content-disposition"]
    report = client.get(f"{base}/report").text
    assert "Maria" not in report and "46 palavras" in report
    assert client.get(f"{base}/other").status_code == 404


def test_gateway_hides_values_and_restores_them(client):
    doc = official(client)
    answer = client.post(f"/api/documents/{doc['id']}/ask",
                         json={"question": f"Quem é {NAME}?"}).json()
    assert NAME not in answer["model_saw"]
    assert answer["answer"] == f"A paciente é {NAME}."
    empty = client.post(f"/api/documents/{doc['id']}/ask",
                        json={"question": "  "})
    assert empty.status_code == 422


def test_upload_text_file_in_utf16(client):
    data = "Contacto: ana@x.pt\nNota: ok\n".encode("utf-16")
    response = client.post("/api/documents",
                           files={"file": ("nota.txt", data, "text/plain")})
    assert response.status_code == 200
    assert response.json()["output"] == ["Contacto: *", "Nota: ok"]


def test_upload_errors(client, monkeypatch):
    bad = client.post("/api/documents",
                      files={"file": ("foto.jpg", b"x", "image/jpeg")})
    assert bad.status_code == 415
    empty = client.post("/api/documents",
                        files={"file": ("vazio.txt", b"  \n", "text/plain")})
    assert empty.status_code == 422
    monkeypatch.setattr(main, "MAX_BYTES", 10)
    big = client.post("/api/documents",
                      files={"file": ("grande.txt", b"x" * 20, "text/plain")})
    assert big.status_code == 413


def test_model_failure_does_not_leak_the_document(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError(f"timeout while sending {NAME}")

    monkeypatch.setattr(main, "generate_fn", broken)
    response = client.post("/api/documents/official")
    assert response.status_code == 502
    assert "Maria" not in response.text


def test_delete_removes_the_document(client):
    doc = official(client)
    assert client.delete(f"/api/documents/{doc['id']}").status_code == 204
    assert client.get(f"/api/documents/{doc['id']}").status_code == 404
    assert main.STORE == {}


def test_cors_origins_come_from_the_environment():
    lovable = "https://abc.lovable.app"
    assert main.cors_origins(None) == main.DEV_ORIGINS
    assert main.cors_origins(f" {lovable}/ , ,http://localhost:5173") == (
        main.DEV_ORIGINS + [lovable])
    # A wildcard would open the API to every site.
    assert main.cors_origins("*") == main.DEV_ORIGINS


def test_dev_server_passes_the_cors_preflight(client):
    response = client.options("/api/health", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"})
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173")
    blocked = client.options("/api/health", headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in blocked.headers
