import json
import re

import pytest
from fastapi.testclient import TestClient

from api import main


@pytest.fixture
def client(monkeypatch):
    def fake_generate(prompt, model=None, json_output=False, **kwargs):
        lines = re.findall(r"^L\d+: (.*)$", prompt, re.M)
        return json.dumps({"masked_lines": lines, "entities": []})

    monkeypatch.setattr(main, "generate_fn", fake_generate)
    main.STORE.clear()
    return TestClient(main.app)


def new_document(client, text="Nome: Rui"):
    response = client.post("/api/documents", files={
        "file": ("x.txt", text.encode(), "text/plain")})
    assert response.status_code == 200
    return response.json()["id"]


def test_a_document_id_cannot_be_guessed():
    ids = {main.new_id() for _ in range(200)}
    assert len(ids) == 200
    assert all(len(i) >= 20 for i in ids)


def test_only_the_newest_documents_are_kept(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_SESSIONS", 3)
    ids = [new_document(client, f"Nome: Rui {n}") for n in range(5)]
    assert len(main.STORE) == 3
    assert client.get(f"/api/documents/{ids[0]}").status_code == 404
    assert client.get(f"/api/documents/{ids[1]}").status_code == 404
    assert client.get(f"/api/documents/{ids[4]}").status_code == 200


def test_a_document_that_is_in_use_is_not_the_one_dropped(client, monkeypatch):
    now = [0.0]
    monkeypatch.setattr(main.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(main, "MAX_SESSIONS", 2)
    first = new_document(client, "Nome: Ana")
    now[0] += 1
    second = new_document(client, "Nome: Rui")
    now[0] += 1
    assert client.get(f"/api/documents/{first}").status_code == 200  # used
    now[0] += 1
    third = new_document(client, "Nome: Eva")
    assert client.get(f"/api/documents/{first}").status_code == 200
    assert client.get(f"/api/documents/{second}").status_code == 404
    assert client.get(f"/api/documents/{third}").status_code == 200


def test_a_document_expires_after_its_time_to_live(client, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(main.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(main, "SESSION_TTL", 60)
    doc = new_document(client)
    now[0] += 59
    assert client.get(f"/api/documents/{doc}").status_code == 200
    now[0] += 61          # idle for more than 60 s since the last use
    assert client.get(f"/api/documents/{doc}").status_code == 404
    assert main.STORE == {}


def test_expired_documents_are_dropped_when_a_new_one_arrives(
        client, monkeypatch):
    now = [0.0]
    monkeypatch.setattr(main.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(main, "SESSION_TTL", 10)
    old = new_document(client, "Nome: Ana")
    now[0] += 100
    new_document(client, "Nome: Rui")
    assert old not in main.STORE
    assert len(main.STORE) == 1


def test_deleting_a_document_still_works(client):
    doc = new_document(client)
    assert client.delete(f"/api/documents/{doc}").status_code == 204
    assert client.get(f"/api/documents/{doc}").status_code == 404
