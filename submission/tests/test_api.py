import io
import json
import re
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from anonimizador.align import align
from anonimizador.metric import read_lines
from anonimizador import llm
from api import main

SUBMISSION = Path(__file__).resolve().parents[1]
GOLD = read_lines(SUBMISSION / "data" / "gold" / "gold.txt")
# The API keeps the punctuation next to a mask ("Flores," -> "*,").
OUTPUT = (align(main._read(main.OFFICIAL_PDF.read_bytes(), ".pdf").lines,
                GOLD, keep_punct=True).lines
          if main.OFFICIAL_PDF.exists() else [])
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
    for limiter in main.LIMITERS:
        limiter.clear()
    return TestClient(main.app)


def official(client):
    response = client.post("/api/documents/official")
    assert response.status_code == 200
    return response.json()


def name_item(doc):
    return next(i for i in doc["items"] if i["text"] == NAME)


def test_health(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("LLM_MODEL", "")
    assert client.get("/api/health").json() == {
        "status": "ok", "provider": "gemini",
        "model": "gemini-3.1-flash-lite", "local": False}
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("LLM_MODEL", "llama3.1:8b")
    assert client.get("/api/health").json() == {
        "status": "ok", "provider": "ollama", "model": "llama3.1:8b",
        "local": True}


def test_local_server_down_says_so(client, monkeypatch):
    def down(*args, **kwargs):
        raise llm.ProviderUnavailableError("Não foi possível ligar ao "
                                           "Ollama em http://localhost:11434.")

    monkeypatch.setattr(main, "generate_fn", down)
    response = client.post("/api/documents/official")
    assert response.status_code == 503
    assert "Ollama" in response.json()["detail"]
    assert NAME not in response.text


def test_official_document_is_anonymised_without_leaks(client):
    doc = official(client)
    assert len(doc["lines"]) == 60
    assert doc["output"] == OUTPUT
    assert doc["summary"]["masked_words"] == 52
    assert doc["leaks"]["leaks"] == []
    assert name_item(doc)["reason"] == "Nome da paciente"


def test_keeping_an_item_shows_it_again_and_can_be_undone(client):
    doc = official(client)
    item = name_item(doc)
    url = f"/api/documents/{doc['id']}/decisions"
    kept = client.put(url, json={"keep": [item["id"]]}).json()
    assert kept["output"][4] == f"Nome: {NAME}"
    assert kept["summary"]["masked_words"] == 48
    assert name_item(kept)["kept"] is True
    undone = client.put(url, json={"keep": []}).json()
    assert undone["output"] == OUTPUT


def test_unknown_item_is_rejected(client):
    doc = official(client)
    response = client.put(f"/api/documents/{doc['id']}/decisions",
                          json={"keep": ["L999-0"]})
    assert response.status_code == 422


def test_downloads_follow_the_review(client):
    doc = official(client)
    base = f"/api/documents/{doc['id']}/download"
    submission = client.get(f"{base}/submission")
    assert submission.text == "\n".join(OUTPUT) + "\n"
    assert "submission.txt" in submission.headers["content-disposition"]
    report = client.get(f"{base}/report").text
    assert "Maria" not in report and "52 palavras" in report
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
                      files={"file": ("foto.gif", b"x", "image/gif")})
    assert bad.status_code == 415
    broken = client.post("/api/documents", files={
        "file": ("foto.jpg", b"SEGREDO-123456789", "image/jpeg")})
    assert broken.status_code == 422
    assert "SEGREDO" not in broken.json()["detail"]
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


DOCX_TYPE = ("application/vnd.openxmlformats-officedocument."
             "wordprocessingml.document")


def test_docx_comes_back_redacted_and_follows_the_review(client, monkeypatch):
    from tests.test_redact import make_docx, names_only

    monkeypatch.setattr(main, "generate_fn", names_only)
    doc = client.post("/api/documents", files={
        "file": ("ficha.docx", make_docx(), DOCX_TYPE)}).json()
    assert doc["kind"] == "docx" and doc["redactable"]
    assert "Nome: * *" in doc["output"]

    url = f"/api/documents/{doc['id']}/download/redacted"
    first = client.get(url)
    assert first.status_code == 200
    assert first.headers["content-type"] == DOCX_TYPE
    assert "ficha_censurado.docx" in first.headers["content-disposition"]
    assert b"Maria" not in first.content

    name = next(i for i in doc["items"] if i["text"] == "Maria Santos"
                and i["line"] == doc["lines"].index("Nome: Maria Santos") + 1)
    client.put(f"/api/documents/{doc['id']}/decisions",
               json={"keep": [name["id"]]})
    kept = client.get(url)
    assert kept.status_code == 200
    from anonimizador.sources import load_source
    assert "Nome: Maria Santos" in load_source(kept.content, ".docx").lines


def test_text_formats_have_no_redacted_file(client):
    doc = client.post("/api/documents", files={
        "file": ("notas.txt", "Nome: Rui".encode(), "text/plain")}).json()
    assert doc["kind"] == "text" and not doc["redactable"]
    response = client.get(f"/api/documents/{doc['id']}/download/redacted")
    assert response.status_code == 404


def test_unread_ocr_lines_block_the_redacted_file_in_the_backend(
        client, monkeypatch):
    from anonimizador.sources import load_source
    from tests.test_redact import make_docx, names_only

    def read_with_unread_lines(data, suffix):
        source = load_source(data, suffix)
        source.unread = 2
        return source

    monkeypatch.setattr(main, "generate_fn", names_only)
    monkeypatch.setattr(main, "_read", read_with_unread_lines)
    doc = client.post("/api/documents", files={
        "file": ("ficha.docx", make_docx(), DOCX_TYPE)}).json()
    assert doc["unread"] == 2
    assert not doc["redactable"]
    base = f"/api/documents/{doc['id']}/download"
    response = client.get(f"{base}/redacted")
    assert response.status_code == 422
    assert "não foram lidas" in response.json()["detail"]
    assert client.get(f"{base}/submission").status_code == 200


def test_failed_verification_sends_no_file(client, monkeypatch):
    from tests.test_redact import make_docx
    from anonimizador.redact import RedactionError

    def refuse(*args, **kwargs):
        raise RedactionError("Verificação falhou: teste.")

    monkeypatch.setattr(main, "redact", refuse)
    doc = client.post("/api/documents", files={
        "file": ("ficha.docx", make_docx(), DOCX_TYPE)}).json()
    response = client.get(f"/api/documents/{doc['id']}/download/redacted")
    assert response.status_code == 422
    assert response.json()["detail"] == "Verificação falhou: teste."


def test_fixed_ocr_text_is_kept_through_the_review(client, monkeypatch):
    from anonimizador.sources import Source

    def model(prompt, model=None, json_output=False, **kwargs):
        if "lido por OCR" in prompt:
            return json.dumps({"lines": ["Informações Financeiras:",
                                         "Nome: Rui Costa"]})
        lines = re.findall(r"^L\d+: (.*)$", prompt, re.M)
        return json.dumps({"masked_lines": [
            line.replace("Rui Costa", "* *") for line in lines],
            "entities": []})

    photo = Source("image", ".png", b"", ["Informações Financelras:",
                                          "Nome: Rui Costa"])
    monkeypatch.setattr(main, "generate_fn", model)
    monkeypatch.setattr(main, "_read", lambda data, suffix: photo)
    doc = client.post("/api/documents", files={
        "file": ("foto.png", b"png", "image/png")}).json()
    assert doc["lines"][0] == "Informações Financeiras:"
    assert doc["output"] == ["Informações Financeiras:", "Nome: * *"]
    name = doc["items"][0]["id"]
    after = client.put(f"/api/documents/{doc['id']}/decisions",
                       json={"keep": [name]}).json()
    assert after["output"] == ["Informações Financeiras:", "Nome: Rui Costa"]


CSV_ROWS = ("nome,nif,telefone,email,morada\n"
            "Maria Santos,123456789,912 345 678,maria@exemplo.pt,"
            "\"Rua das Flores 23, Lisboa\"\n")


def test_csv_is_masked_cell_by_cell_and_comes_back_as_csv(
        client, monkeypatch):
    import csv
    import io
    from tests.test_redact import names_only

    monkeypatch.setattr(main, "generate_fn", names_only)
    doc = client.post("/api/documents", files={
        "file": ("clientes.csv", CSV_ROWS.encode(), "text/csv")}).json()
    assert doc["kind"] == "csv" and doc["redactable"]
    assert doc["lines"][0] == "nome , nif , telefone , email , morada"
    # The name by the model, the phone and the email by the safety net:
    # one item per cell, and the separators stay.
    assert doc["output"][1] == ("* * , 123456789 , * * * , * , "
                                "Rua das Flores 23, Lisboa")
    assert [i["text"] for i in doc["items"]] == [
        "Maria Santos", "912 345 678", "maria@exemplo.pt"]
    assert doc["leaks"]["leaks"] == []

    url = f"/api/documents/{doc['id']}/download/redacted"
    first = client.get(url)
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("text/csv")
    assert "clientes_censurado.csv" in first.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(first.content.decode("utf-8-sig"))))
    assert rows == [["nome", "nif", "telefone", "email", "morada"],
                    ["* *", "123456789", "* * *", "*",
                     "Rua das Flores 23, Lisboa"]]

    name = next(i for i in doc["items"] if i["text"] == "Maria Santos")
    client.put(f"/api/documents/{doc['id']}/decisions",
               json={"keep": [name["id"]]})
    kept = list(csv.reader(io.StringIO(
        client.get(url).content.decode("utf-8-sig"))))
    assert kept[1][0] == "Maria Santos"


def test_the_redacted_file_is_built_once_per_review(client, monkeypatch):
    from anonimizador import redact as redact_module
    from tests.test_redact import make_docx, names_only

    builds = []

    def counted(*args, **kwargs):
        builds.append(args[1])  # the masked words of that build
        return redact_module.redact(*args, **kwargs)

    monkeypatch.setattr(main, "generate_fn", names_only)
    monkeypatch.setattr(main, "redact", counted)
    doc = client.post("/api/documents", files={
        "file": ("ficha.docx", make_docx(), DOCX_TYPE)}).json()
    url = f"/api/documents/{doc['id']}/download/redacted"
    # The build starts with the upload; the preview and the download reuse it.
    first, second = client.get(url), client.get(url)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert len(builds) == 1
    # The same review again changes nothing; a new review builds a new file.
    client.put(f"/api/documents/{doc['id']}/decisions", json={"keep": []})
    assert client.get(url).status_code == 200 and len(builds) == 1
    name = next(i for i in doc["items"] if i["text"] == "Maria Santos")
    client.put(f"/api/documents/{doc['id']}/decisions",
               json={"keep": [name["id"]]})
    kept = client.get(url)
    assert kept.status_code == 200 and kept.content != first.content
    assert len(builds) == 2 and len(builds[1]) < len(builds[0])


def test_no_redacted_file_is_built_for_text_or_unread_documents(
        client, monkeypatch):
    from anonimizador.sources import load_source

    monkeypatch.setattr(main, "redact", lambda *a, **k: pytest.fail(
        "a text document started a redacted file"))
    doc = client.post("/api/documents", files={
        "file": ("notas.txt", "Nome: Rui".encode(), "text/plain")}).json()
    assert main.STORE[doc["id"]].redaction is None

    def read_with_unread_lines(data, suffix):
        source = load_source(data, suffix)
        source.unread = 1
        return source

    monkeypatch.setattr(main, "_read", read_with_unread_lines)
    from tests.test_redact import make_docx
    doc = client.post("/api/documents", files={
        "file": ("ficha.docx", make_docx(), DOCX_TYPE)}).json()
    assert main.STORE[doc["id"]].redaction is None


# --- several files at once -------------------------------------------------

def txt(name, text):
    return ("files", (name, text.encode(), "text/plain"))


def batch(client, *files, **kwargs):
    return client.post("/api/documents/batch", files=list(files), **kwargs)


def test_batch_creates_one_document_per_file(client):
    response = batch(client, txt("a.txt", "Nome: Rui\n"),
                     txt("b.txt", "Contacto: ana@x.pt\n"))
    assert response.status_code == 200
    docs = response.json()["documents"]
    assert [d["name"] for d in docs] == ["a.txt", "b.txt"]
    states = [d["state"] for d in docs]
    assert states[0]["output"] == ["Nome: Rui"]
    assert states[1]["output"] == ["Contacto: *"]
    assert states[0]["id"] != states[1]["id"]
    assert set(main.STORE) == {states[0]["id"], states[1]["id"]}
    assert "error" not in docs[0] and "error" not in docs[1]


def test_batch_reports_a_bad_file_without_losing_the_others(client):
    response = batch(client, ("files", ("x.exe", b"MZ-SEGREDO", "x/y")),
                     txt("vazio.txt", "  \n"), txt("ok.txt", "Nome: Rui\n"))
    assert response.status_code == 200
    bad, empty, good = response.json()["documents"]
    assert bad["error"]["status"] == 415 and "state" not in bad
    assert "SEGREDO" not in response.text
    assert empty["error"]["status"] == 422
    assert good["state"]["id"] in main.STORE
    assert len(main.STORE) == 1


def test_batch_model_failure_is_one_entry(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError(f"timeout while sending {NAME}")

    monkeypatch.setattr(main, "generate_fn", broken)
    response = batch(client, txt("a.txt", f"Nome: {NAME}\n"))
    assert response.status_code == 200
    (entry,) = response.json()["documents"]
    assert entry["error"] == {"status": 502, "detail": main.MODEL_DOWN}
    assert "Maria" not in response.text


def test_batch_limits_the_number_of_files(client):
    too_many = batch(client, *(txt(f"{n}.txt", "Nome: Rui\n")
                               for n in range(main.MAX_BATCH_FILES + 1)))
    assert too_many.status_code == 413
    assert main.STORE == {}
    assert client.post("/api/documents/batch").status_code == 422


def test_batch_is_rate_limited_per_client(client, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(main.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(main, "BATCH_LIMITER", main.RateLimiter("2/minute"))
    for _ in range(2):
        assert batch(client, txt("a.txt", "Nome: Rui\n")).status_code == 200
    refused = batch(client, txt("a.txt", "Nome: Rui\n"))
    assert refused.status_code == 429
    assert refused.headers["Retry-After"] == "60"
    assert "60 s" in refused.json()["detail"]
    # Another client is not affected.
    other = batch(client, txt("a.txt", "Nome: Rui\n"),
                  headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1"})
    assert other.status_code == 200
    # The window slides: after a minute the first client is served again.
    now[0] += 30
    assert batch(client, txt("a.txt", "Nome: Rui\n")).status_code == 429
    now[0] += 30
    assert batch(client, txt("a.txt", "Nome: Rui\n")).status_code == 200


def test_batch_file_budget_refuses_the_whole_request(client, monkeypatch):
    monkeypatch.setattr(main, "BATCH_FILES_LIMITER",
                        main.RateLimiter("3/minute"))
    first = batch(client, txt("a.txt", "Nome: Rui\n"),
                  txt("b.txt", "Nome: Ana\n"))
    assert first.status_code == 200
    second = batch(client, txt("c.txt", "Nome: Rui\n"),
                   txt("d.txt", "Nome: Ana\n"))
    assert second.status_code == 429
    assert len(main.STORE) == 2  # nothing of the refused batch was processed
    # A single file still fits in the remaining budget.
    assert batch(client, txt("e.txt", "Nome: Eva\n")).status_code == 200


def test_rate_limiter_counts_a_sliding_window():
    now = [0.0]
    limiter = main.RateLimiter("3/minute")
    real = main.time.monotonic
    main.time.monotonic = lambda: now[0]
    try:
        assert limiter.wait("a") == 0 and limiter.wait("a", 2) == 0
        assert limiter.wait("a") == 60
        now[0] = 59
        assert limiter.wait("a") == 1
        now[0] = 60
        assert limiter.wait("a") == 0  # both hits from t=0 are gone
        assert limiter.wait("a", 2) == 0
        assert limiter.wait("a") == 60
        # A cost that never fits is answered with the whole period.
        assert limiter.wait("b", 4) == 60
        assert "b" not in limiter._hits
    finally:
        main.time.monotonic = real
    with pytest.raises(ValueError):
        main.RateLimiter("many")


def zip_of(client, ids, **kwargs):
    response = client.post("/api/documents/zip", json={"ids": ids}, **kwargs)
    return response, (zipfile.ZipFile(io.BytesIO(response.content))
                      if response.status_code == 200 else None)


def test_zip_has_a_folder_per_document(client):
    docs = batch(client, txt("nota.txt", "Nome: Rui\n"),
                 txt("nota.txt", "Contacto: ana@x.pt\n")).json()["documents"]
    ids = [d["state"]["id"] for d in docs]
    response, archive = zip_of(client, ids)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "lethe-documentos.zip" in response.headers["content-disposition"]
    assert sorted(archive.namelist()) == [
        "LEIA-ME.txt", "nota (2)/report.md", "nota (2)/submission.txt",
        "nota/report.md", "nota/submission.txt"]
    assert archive.read("nota/submission.txt").decode() == "Nome: Rui\n"
    assert archive.read("nota (2)/submission.txt").decode() == "Contacto: *\n"
    assert "ana@x.pt" not in archive.read("nota (2)/report.md").decode()
    readme = archive.read("LEIA-ME.txt").decode()
    assert "nota:" in readme and "nota (2):" in readme
    assert "texto" in readme  # the format only has a text output


def test_zip_includes_the_redacted_file_after_the_review(client, monkeypatch):
    from tests.test_redact import make_docx, names_only
    monkeypatch.setattr(main, "generate_fn", names_only)
    (doc,) = batch(client, ("files", ("ficha.docx", make_docx(),
                                      "application/octet-stream"))
                   ).json()["documents"]
    doc_id = doc["state"]["id"]
    assert doc["state"]["redactable"]
    client.put(f"/api/documents/{doc_id}/decisions", json={"keep": []})
    response, archive = zip_of(client, [doc_id, doc_id])  # repeats are one
    assert response.status_code == 200
    assert sorted(archive.namelist()) == [
        "ficha/ficha_censurado.docx", "ficha/report.md",
        "ficha/submission.txt"]
    assert b"Maria" not in archive.read("ficha/ficha_censurado.docx")


def test_zip_errors(client, monkeypatch):
    assert zip_of(client, [])[0].status_code == 422
    assert zip_of(client, ["nope"])[0].status_code == 404
    doc = official(client)
    assert zip_of(client, [doc["id"], "nope"])[0].status_code == 404
    monkeypatch.setattr(main, "ZIP_LIMITER", main.RateLimiter("1/minute"))
    assert zip_of(client, [doc["id"]])[0].status_code == 200
    refused = zip_of(client, [doc["id"]])[0]
    assert refused.status_code == 429 and refused.headers["Retry-After"]


def test_folder_names_are_safe_and_unique():
    used = set()
    assert main._folder_name("../a/b:c?.pdf", used) == "b c"
    assert main._folder_name("B C.txt", used) == "B C (2)"
    assert main._folder_name("", used) == "documento"
    assert main._folder_name(".hidden", used) == "hidden"
